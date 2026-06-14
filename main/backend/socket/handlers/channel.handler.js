import { insertMessage } from '../../services/message.service.js';
import { Channel, ChannelMember } from '../../services/message.service.js';
import { ChatError } from '../../chat-errors.js';

/**
 * Channel Handler — registers all group channel socket events.
 *
 * Called once per socket connection from socket/index.js:
 *   registerChannelHandlers(socket, io)
 *
 * Events managed:
 *   channel:join    (client → server) — join a channel room
 *   channel:leave   (client → server) — leave a channel room
 *   channel:send    (client → server) — send a message to a channel
 *   channel:message (server → client) — broadcast message to room members
 *   channel:error   (server → client) — something went wrong
 */
export function registerChannelHandlers(socket, io) {
  const { userId, displayName } = socket.user;

  // ─── channel:join ──────────────────────────────────────────────────────────
  /**
   * Requirement 4.3 — join a channel's Socket.io room.
   *
   * Payload: { channelId: string }
   *
   * Flow:
   *   1. Check channel exists → CHANNEL_NOT_FOUND if not
   *   2. Check capacity (≤ 1000 members) → CHANNEL_FULL if at limit
   *   3. Upsert ChannelMember record (idempotent — safe to rejoin)
   *   4. socket.join(channelId) — user can now receive channel:message events
   */
  socket.on('channel:join', async ({ channelId } = {}) => {
    try {
      if (!channelId) {
        return socket.emit('channel:error', {
          code: 'CHANNEL_NOT_FOUND',
          message: 'channelId is required',
        });
      }

      // Requirement 4.6 — channel must exist
      const channel = await Channel.findById(channelId);
      if (!channel) {
        return socket.emit('channel:error', {
          code: 'CHANNEL_NOT_FOUND',
          message: 'Channel not found',
        });
      }

      // Requirement 4.7 — capacity check (max 1000 members)
      const alreadyMember = await ChannelMember.exists({ channelId, userId });
      if (!alreadyMember && channel.memberCount >= 1000) {
        return socket.emit('channel:error', {
          code: 'CHANNEL_FULL',
          message: 'This channel has reached its maximum capacity of 1,000 members',
        });
      }

      // Upsert membership — safe to call multiple times (idempotent)
      if (!alreadyMember) {
        await ChannelMember.create({ channelId, userId, role: 'member' });
        // Increment the denormalized member count on the channel document
        await Channel.updateOne({ _id: channelId }, { $inc: { memberCount: 1 } });
      }

      // Join the Socket.io room — all future channel:message events go here
      socket.join(channelId);

      socket.emit('channel:joined', { channelId, name: channel.name });
      console.log(`[Channel] ${displayName} joined channel ${channel.name} (${channelId})`);

    } catch (err) {
      console.error('[channel:join]', err);
      socket.emit('channel:error', {
        code: 'INTERNAL_ERROR',
        message: 'Failed to join channel',
      });
    }
  });

  // ─── channel:leave ─────────────────────────────────────────────────────────
  /**
   * Leave a channel's Socket.io room.
   * The user stays in ChannelMember (they're still a member),
   * they just stop receiving real-time events until they rejoin.
   *
   * Payload: { channelId: string }
   */
  socket.on('channel:leave', ({ channelId } = {}) => {
    if (!channelId) return;
    socket.leave(channelId);
    console.log(`[Channel] ${displayName} left room ${channelId}`);
  });

  // ─── channel:send ──────────────────────────────────────────────────────────
  /**
   * Requirement 4.4 — send a message to a channel.
   *
   * Payload: { channelId: string, content: string }
   *
   * Flow:
   *   1. Verify the sender is a member → NOT_A_MEMBER if not
   *   2. Validate content length
   *   3. insertMessage() — saves to MongoDB
   *   4. Broadcast channel:message to all members in the Socket.io room
   */
  socket.on('channel:send', async (data, ack) => {
    try {
      const { channelId, content } = data || {};

      if (!channelId) {
        return socket.emit('channel:error', {
          code: 'CHANNEL_NOT_FOUND',
          message: 'channelId is required',
        });
      }

      // Requirement 4.5 — sender must be a member
      const isMember = await ChannelMember.exists({ channelId, userId });
      if (!isMember) {
        return socket.emit('channel:error', {
          code: 'NOT_A_MEMBER',
          message: 'You are not a member of this channel',
        });
      }

      // Content validation (also enforced inside insertMessage, fail fast here)
      if (!content || content.trim().length === 0) {
        return socket.emit('channel:error', {
          code: 'MESSAGE_INVALID',
          message: 'Message content cannot be empty',
        });
      }
      if (content.length > 4000) {
        return socket.emit('channel:error', {
          code: 'MESSAGE_INVALID',
          message: 'Message content exceeds 4000 characters',
        });
      }

      // Persist the message
      let message;
      try {
        message = await insertMessage({ senderId: userId, channelId, content });
      } catch (err) {
        return socket.emit('channel:error', {
          code: err instanceof ChatError ? err.code : 'MESSAGE_PERSIST_FAILED',
          message: err.message,
        });
      }

      // Requirement 4.4 — broadcast to all members in the room within 300 ms
      // io.to(channelId) sends to everyone in the Socket.io room (including sender)
      io.to(channelId).emit('channel:message', {
        messageId: message.messageId,
        channelId,
        from: userId,
        senderId: userId,
        fromDisplayName: displayName,
        content: message.content,
        deliveryStatus: 'sent',
        createdAt: message.createdAt,
      });

      // Acknowledge the send back to the sender
      if (typeof ack === 'function') {
        ack({ messageId: message.messageId, status: 'sent' });
      }

    } catch (err) {
      console.error('[channel:send]', err);
      socket.emit('channel:error', {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      });
    }
  });

  // ─── Auto-rejoin channels on reconnect ────────────────────────────────────
  /**
   * When a user reconnects, they need to rejoin all their channel rooms.
   * Socket.io rooms are in-memory — they're lost on disconnect.
   * We query their ChannelMember records and rejoin all rooms.
   */
  rejoinChannels(socket, userId);
}

/**
 * rejoinChannels — re-subscribe to all channel rooms after reconnection.
 *
 * @param {Socket} socket
 * @param {string} userId
 */
async function rejoinChannels(socket, userId) {
  try {
    const memberships = await ChannelMember.find({ userId }).select('channelId').lean();
    for (const { channelId } of memberships) {
      socket.join(channelId.toString());
    }
    if (memberships.length > 0) {
      console.log(`[Channel] ${userId} rejoined ${memberships.length} channel room(s)`);
    }
  } catch (err) {
    console.error('[Channel] rejoinChannels error:', err);
  }
}
