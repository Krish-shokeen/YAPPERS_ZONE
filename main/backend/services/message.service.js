import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { ChatError } from '../chat-errors.js';

// ─── Schema ──────────────────────────────────────────────────────────────────

/**
 * Message schema — stores every chat message (DMs and channel messages).
 *
 * Key design decisions:
 *
 * messageId (UUIDv4, not _id):
 *   We use a separate UUID instead of relying on MongoDB's _id because the
 *   frontend generates optimistic messages before the DB round-trip completes.
 *   UUIDs are easier to reference across socket events.
 *
 * recipientId vs channelId — exactly one must be set:
 *   DM message  → recipientId is set, channelId is null
 *   Channel msg → channelId is set,  recipientId is null
 *
 * content vs encryptedPayload:
 *   Plain message       → content is set,          encryptedPayload is null
 *   E2E encrypted (DM)  → content is null,          encryptedPayload is set (base64)
 *   isEncrypted flag lets the search index exclude encrypted messages.
 *
 * parentMessageId:
 *   null = top-level message
 *   set  = this is a thread reply to the referenced message
 */
const messageSchema = new mongoose.Schema(
  {
    // Globally unique identifier (UUIDv4) — used in socket events and delivery status
    messageId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Who sent this message
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // DM: recipient user | null for channel messages
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // Channel message: which channel | null for DMs
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
      default: null,
    },

    // Thread reply: which message this is a reply to | null for top-level
    parentMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },

    // Plaintext content — null when message is E2E encrypted
    content: {
      type: String,
      default: null,
    },

    // Base64 ciphertext — null for plaintext messages
    encryptedPayload: {
      type: String,
      default: null,
    },

    // sent → delivered → read
    deliveryStatus: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent',
    },

    // Media attachments (images, videos, files)
    mediaAttachments: [
      {
        mediaId: mongoose.Schema.Types.ObjectId,
        mimeType: String,
        name: String,
        size: Number,
      },
    ],

    // Emoji reactions: [{ emoji: '👍', userIds: [ObjectId, ...] }]
    reactions: [
      {
        emoji: { type: String, required: true },
        userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      },
    ],

    // true when encryptedPayload is set — used by search index partial filter
    isEncrypted: {
      type: Boolean,
      default: false,
    },

    // Soft delete — never hard-delete messages so threads stay intact
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    // Mongoose auto-adds createdAt and updatedAt
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
// These make pagination fast even for conversations with 100,000+ messages.

// DM history: fetch messages between two users, newest first
messageSchema.index({ senderId: 1, recipientId: 1, createdAt: -1 });

// Channel history: fetch messages in a channel, newest first
messageSchema.index({ channelId: 1, createdAt: -1 });

// Thread replies: fetch replies to a parent message, newest first
messageSchema.index({ parentMessageId: 1, createdAt: -1 });

// Full-text search — only indexes plaintext messages (not encrypted ones)
messageSchema.index(
  { content: 'text' },
  { partialFilterExpression: { isEncrypted: false } }
);

const Message = mongoose.model('Message', messageSchema);

// ─── Channel Schema (also lives here for now) ─────────────────────────────────

const channelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    nameLower: { type: String, required: true, unique: true }, // for case-insensitive uniqueness
    description: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    memberCount: { type: Number, default: 1 },
  },
  { timestamps: true }
);

const Channel = mongoose.model('Channel', channelSchema);

// ─── Channel Members Schema ────────────────────────────────────────────────────

const channelMemberSchema = new mongoose.Schema({
  channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['owner', 'member'], default: 'member' },
  joinedAt: { type: Date, default: Date.now },
});

// Unique membership — a user can only be in a channel once
channelMemberSchema.index({ channelId: 1, userId: 1 }, { unique: true });
// Fast lookup of all channels a user belongs to
channelMemberSchema.index({ userId: 1, channelId: 1 });

const ChannelMember = mongoose.model('ChannelMember', channelMemberSchema);

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * insertMessage — persist a new message to MongoDB.
 *
 * @param {object} payload
 *   senderId       (ObjectId|string) — who's sending
 *   recipientId    (ObjectId|string) — set for DMs, omit for channels
 *   channelId      (ObjectId|string) — set for channels, omit for DMs
 *   content        (string)          — plaintext, 1–4000 chars
 *   encryptedPayload (string)        — base64 ciphertext (E2E), replaces content
 *   parentMessageId (ObjectId)       — for thread replies
 *
 * @returns {Promise<Message>} the saved message document
 */
export async function insertMessage(payload) {
  const { senderId, recipientId, channelId, content, encryptedPayload, parentMessageId } = payload;

  // Requirement 2.4 — validate content length (1–4000 chars)
  // For E2E messages we validate the plaintext was valid before encryption
  if (!encryptedPayload) {
    if (!content || content.trim().length === 0) {
      throw new ChatError('MESSAGE_INVALID', 400, 'Message content cannot be empty');
    }
    if (content.length > 4000) {
      throw new ChatError('MESSAGE_INVALID', 400, 'Message content exceeds 4000 characters');
    }
  }

  // Requirement 2.3 — assign a globally unique messageId (UUIDv4)
  const message = new Message({
    messageId: uuidv4(),
    senderId,
    recipientId: recipientId || null,
    channelId: channelId || null,
    parentMessageId: parentMessageId || null,
    content: encryptedPayload ? null : content,
    encryptedPayload: encryptedPayload || null,
    isEncrypted: !!encryptedPayload,
    deliveryStatus: 'sent', // Requirement 7.1 — initial status is always 'sent'
  });

  try {
    await message.save();
    return message;
  } catch (err) {
    throw new ChatError('MESSAGE_PERSIST_FAILED', 500, 'Failed to save message to database');
  }
}

/**
 * getHistory — fetch paginated message history for a conversation.
 *
 * Uses cursor-based pagination (by timestamp) rather than page numbers.
 * This is more reliable for real-time chats where new messages arrive constantly.
 *
 * @param {object} options
 *   conversationId  (string) — userId for DMs, channelId for channels
 *   type            ('dm'|'channel')
 *   currentUserId   (string) — used to verify the requester is a participant
 *   cursor          (Date|null) — fetch messages older than this timestamp
 *   limit           (number) — default 50
 *
 * @returns {Promise<{ messages: Message[], hasMore: boolean }>}
 */
export async function getHistory({ conversationId, type, currentUserId, cursor, limit = 50 }) {
  let query;

  if (type === 'dm') {
    // Requirement 3.5 — only participants can read a DM conversation
    // A DM conversation is identified by the two user IDs (in either order)
    query = {
      $or: [
        { senderId: currentUserId, recipientId: conversationId },
        { senderId: conversationId, recipientId: currentUserId },
      ],
      parentMessageId: null, // top-level messages only (not thread replies)
      isDeleted: false,
    };
  } else {
    // Channel — verify membership before returning history
    const isMember = await ChannelMember.exists({
      channelId: conversationId,
      userId: currentUserId,
    });

    if (!isMember) {
      throw new ChatError('UNAUTHORIZED', 403, 'You are not a member of this channel');
    }

    query = {
      channelId: conversationId,
      parentMessageId: null,
      isDeleted: false,
    };
  }

  // Requirement 3.2 — cursor-based pagination
  // Only return messages OLDER than the cursor timestamp
  if (cursor) {
    query.createdAt = { $lt: new Date(cursor) };
  }

  // Fetch limit+1 so we can tell if there are more pages without an extra count query
  const messages = await Message.find(query)
    .sort({ createdAt: -1 }) // newest first (Requirement 3.1)
    .limit(limit + 1)
    .lean(); // lean() returns plain JS objects, faster than full Mongoose documents

  const hasMore = messages.length > limit;
  if (hasMore) messages.pop(); // remove the extra one we fetched

  return {
    messages,
    hasMore, // Requirement 3.3 — end-of-history indicator
  };
}

/**
 * updateDeliveryStatus — update a message's delivery status.
 * Called when:
 *   - recipient's socket acknowledges dm:receive → 'delivered'
 *   - recipient's Chat_Pane scrolls message into view → 'read'
 *
 * @param {string} messageId - the UUIDv4 messageId (not MongoDB _id)
 * @param {'delivered'|'read'} status
 */
export async function updateDeliveryStatus(messageId, status) {
  await Message.updateOne(
    { messageId },
    { $set: { deliveryStatus: status, updatedAt: new Date() } }
  );
}

// Export models so other services can use them
export { Message, Channel, ChannelMember };
