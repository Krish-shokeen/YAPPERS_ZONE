import express from 'express';
import { Channel, ChannelMember, Message, getHistory, getThreadHistory } from '../services/message.service.js';
import { ChatError } from '../chat-errors.js';

const router = express.Router();

/**
 * All routes here require the chatAuthMiddleware to be applied at the
 * server level before this router is mounted (done in server.js).
 * req.user is populated by that middleware.
 */

// ─── POST /api/channels ───────────────────────────────────────────────────────
/**
 * Create a new channel (Zone).
 *
 * Requirement 4.1 — name must be 3–80 chars, alphanumeric + hyphens
 * Requirement 4.2 — name must be unique (case-insensitive)
 *
 * Body: { name: string, description?: string }
 */
router.post('/', async (req, res) => {
  try {
    const { name, description = '' } = req.body;
    const creatorId = req.user.userId;

    // Validate name format
    if (!name || name.length < 3 || name.length > 80) {
      throw new ChatError(
        'CHANNEL_NAME_INVALID',
        400,
        'Channel name must be between 3 and 80 characters'
      );
    }

    // Only alphanumeric and hyphens allowed
    if (!/^[a-zA-Z0-9-]+$/.test(name)) {
      throw new ChatError(
        'CHANNEL_NAME_INVALID',
        400,
        'Channel name can only contain letters, numbers, and hyphens'
      );
    }

    // Validate description length
    if (description.length > 500) {
      throw new ChatError(
        'CHANNEL_DESCRIPTION_INVALID',
        400,
        'Channel description cannot exceed 500 characters'
      );
    }

    // Requirement 4.2 — case-insensitive uniqueness check via nameLower
    const nameLower = name.toLowerCase();
    const existing = await Channel.findOne({ nameLower });
    if (existing) {
      throw new ChatError(
        'CHANNEL_NAME_TAKEN',
        409,
        `A channel named "${name}" already exists`
      );
    }

    // Create the channel document
    const channel = await Channel.create({
      name,
      nameLower,
      description,
      createdBy: creatorId,
      memberCount: 1,
    });

    // Add the creator as the first member with role 'owner'
    await ChannelMember.create({
      channelId: channel._id,
      userId: creatorId,
      role: 'owner',
    });

    res.status(201).json({
      channel: {
        id: channel._id,
        name: channel.name,
        description: channel.description,
        memberCount: channel.memberCount,
        createdAt: channel.createdAt,
      },
    });

  } catch (err) {
    if (err instanceof ChatError) {
      return res.status(err.statusCode).json({ code: err.code, message: err.message });
    }
    console.error('[POST /channels]', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to create channel' });
  }
});

// ─── GET /api/channels ────────────────────────────────────────────────────────
/**
 * List all channels the requesting user is a member of.
 * Used by the frontend to populate the Sidebar / YappersHub canvas.
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;

    // Find all ChannelMember records for this user
    const memberships = await ChannelMember.find({ userId })
      .select('channelId role joinedAt')
      .lean();

    if (memberships.length === 0) {
      return res.json({ channels: [] });
    }

    // Fetch the channel details for each membership
    const channelIds = memberships.map((m) => m.channelId);
    const channels = await Channel.find({ _id: { $in: channelIds } })
      .select('name description memberCount createdAt')
      .lean();

    // Merge channel data with the user's role in each channel
    const membershipMap = {};
    memberships.forEach((m) => {
      membershipMap[m.channelId.toString()] = { role: m.role, joinedAt: m.joinedAt };
    });

    const result = channels.map((ch) => ({
      id: ch._id,
      name: ch.name,
      description: ch.description,
      memberCount: ch.memberCount,
      createdAt: ch.createdAt,
      role: membershipMap[ch._id.toString()]?.role,
      joinedAt: membershipMap[ch._id.toString()]?.joinedAt,
    }));

    res.json({ channels: result });

  } catch (err) {
    console.error('[GET /channels]', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to fetch channels' });
  }
});

// ─── GET /api/channels/public ────────────────────────────────────────────────
/**
 * List all public channels (excluding channels the requesting user is already a member of).
 * Used by CosmicExplorer for zone discovery.
 */
router.get('/public', async (req, res) => {
  try {
    const userId = req.user.userId;

    // Find channel IDs user is already in
    const memberships = await ChannelMember.find({ userId }).select('channelId').lean();
    const joinedChannelIds = memberships.map((m) => m.channelId.toString());

    // Find all channels that the user is not in
    const channels = await Channel.find({ _id: { $nin: joinedChannelIds } })
      .select('name description memberCount createdAt')
      .lean();

    const result = channels.map((ch) => ({
      id: ch._id,
      name: ch.name,
      description: ch.description,
      memberCount: ch.memberCount,
      createdAt: ch.createdAt,
    }));

    res.json({ channels: result });
  } catch (err) {
    console.error('[GET /channels/public]', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to fetch public channels' });
  }
});

// ─── GET /api/channels/:channelId ─────────────────────────────────────────────
/**
 * Get details of a single channel.
 * Used by ExpandedChatView to load channel info.
 */
router.get('/:channelId', async (req, res) => {
  try {
    const { channelId } = req.params;
    const userId = req.user.userId;

    const channel = await Channel.findById(channelId).lean();
    if (!channel) {
      throw new ChatError('CHANNEL_NOT_FOUND', 404, 'Channel not found');
    }

    // Verify the requesting user is a member
    const membership = await ChannelMember.findOne({ channelId, userId }).lean();
    if (!membership) {
      throw new ChatError('NOT_A_MEMBER', 403, 'You are not a member of this channel');
    }

    res.json({
      channel: {
        id: channel._id,
        name: channel.name,
        description: channel.description,
        memberCount: channel.memberCount,
        createdAt: channel.createdAt,
        role: membership.role,
      },
    });

  } catch (err) {
    if (err instanceof ChatError) {
      return res.status(err.statusCode).json({ code: err.code, message: err.message });
    }
    console.error('[GET /channels/:id]', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to fetch channel' });
  }
});

// ─── GET /api/channels/:channelId/messages ──────────────────────────────────
/**
 * Get message history for a conversation (channel or DM).
 *
 * Query params: cursor (timestamp), limit (number)
 */
router.get('/:channelId/messages', async (req, res) => {
  try {
    const { channelId } = req.params;
    const { cursor, limit = 50 } = req.query;
    const currentUserId = req.user.userId;

    // Check if conversation is channel or DM
    const isChannel = await Channel.exists({ _id: channelId });
    const type = isChannel ? 'channel' : 'dm';

    const history = await getHistory({
      conversationId: channelId,
      type,
      currentUserId,
      cursor: cursor ? new Date(cursor) : null,
      limit: parseInt(limit, 10),
    });

    res.json(history);
  } catch (err) {
    if (err instanceof ChatError) {
      return res.status(err.statusCode).json({ code: err.code, message: err.message });
    }
    console.error('[GET /channels/:id/messages]', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to fetch conversation history' });
  }
});

// ─── GET /api/channels/messages/:messageId/replies ──────────────────────────
/**
 * Get thread replies for a parent message.
 *
 * Query params: cursor (timestamp), limit (number)
 */
router.get('/messages/:messageId/replies', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { cursor, limit = 50 } = req.query;
    const currentUserId = req.user.userId;

    const parentMessage = await Message.findOne({ messageId });
    if (!parentMessage) {
      throw new ChatError('MESSAGE_NOT_FOUND', 404, 'Parent message not found');
    }

    // Authorize access
    if (parentMessage.channelId) {
      const isMember = await ChannelMember.exists({ channelId: parentMessage.channelId, userId: currentUserId });
      if (!isMember) {
        throw new ChatError('NOT_A_MEMBER', 403, 'You are not a member of this channel');
      }
    } else if (parentMessage.recipientId) {
      const sId = parentMessage.senderId.toString();
      const rId = parentMessage.recipientId.toString();
      if (sId !== currentUserId.toString() && rId !== currentUserId.toString()) {
        throw new ChatError('UNAUTHORIZED', 403, 'You are not authorized to access this conversation');
      }
    }

    const history = await getThreadHistory(
      parentMessage._id,
      cursor ? new Date(cursor) : null,
      parseInt(limit, 10)
    );

    res.json(history);
  } catch (err) {
    if (err instanceof ChatError) {
      return res.status(err.statusCode).json({ code: err.code, message: err.message });
    }
    console.error('[GET /channels/messages/:messageId/replies]', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to fetch thread replies' });
  }
});

// ─── GET /api/channels/:channelId/pins ──────────────────────────────────────
router.get('/:channelId/pins', async (req, res) => {
  try {
    const { channelId } = req.params;
    const currentUserId = req.user.userId;

    const isChannel = await Channel.exists({ _id: channelId });
    
    let query = { isPinned: true, isDeleted: false };
    if (isChannel) {
      const isMember = await ChannelMember.exists({ channelId, userId: currentUserId });
      if (!isMember) {
        throw new ChatError('NOT_A_MEMBER', 403, 'You are not a member of this channel');
      }
      query.channelId = channelId;
    } else {
      if (channelId !== currentUserId.toString()) {
        query.$or = [
          { senderId: currentUserId, recipientId: channelId },
          { senderId: channelId, recipientId: currentUserId }
        ];
      } else {
        query.senderId = currentUserId;
        query.recipientId = currentUserId;
      }
    }

    const rawPins = await Message.find(query)
      .sort({ createdAt: -1 })
      .lean();

    // Attach fromDisplayName from the stored field (senderId is an ObjectId, not a User ref)
    const pins = rawPins.map((msg) => ({
      ...msg,
      fromDisplayName: msg.fromDisplayName || msg.senderDisplayName || null,
    }));

    res.json({ pins });
  } catch (err) {
    if (err instanceof ChatError) {
      return res.status(err.statusCode).json({ code: err.code, message: err.message });
    }
    console.error('[GET /channels/:id/pins]', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to fetch pinned messages' });
  }
});

export default router;
