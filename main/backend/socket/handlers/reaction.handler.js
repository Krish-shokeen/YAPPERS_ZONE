import { addReaction, removeReaction, Message, ChannelMember } from '../../services/message.service.js';
import { ChatError } from '../../chat-errors.js';

/**
 * Reaction Handler — registers socket events for emoji reactions.
 *
 * Events:
 *   reaction:add    (client → server) — toggle/add reaction
 *   reaction:remove (client → server) — explicitly remove reaction
 *   reaction:update (server → client) — broadcast updated reaction list with counts
 *   reaction:error  (server → client) — error during reaction handling
 */
export function registerReactionHandlers(socket, io) {
  const { userId } = socket.user;

  // Helper to verify user is allowed to react to a message
  async function authorizeMessageAccess(message) {
    if (message.channelId) {
      const isMember = await ChannelMember.exists({ channelId: message.channelId, userId });
      if (!isMember) {
        throw new ChatError('NOT_A_MEMBER', 403, 'You are not a member of this channel');
      }
    } else if (message.recipientId) {
      const sId = message.senderId.toString();
      const rId = message.recipientId.toString();
      if (sId !== userId.toString() && rId !== userId.toString()) {
        throw new ChatError('UNAUTHORIZED', 403, 'You are not authorized to access this conversation');
      }
    }
  }

  // Helper to broadcast reaction:update
  function broadcastReactionUpdate(message, summary) {
    if (message.channelId) {
      io.to(message.channelId.toString()).emit('reaction:update', summary);
    } else if (message.recipientId) {
      io.to(message.senderId.toString())
        .to(message.recipientId.toString())
        .emit('reaction:update', summary);
    }
  }

  // ─── reaction:add ──────────────────────────────────────────────────────────
  socket.on('reaction:add', async ({ messageId, emoji } = {}) => {
    try {
      if (!messageId || !emoji) {
        return socket.emit('reaction:error', {
          code: 'BAD_REQUEST',
          message: 'messageId and emoji are required',
        });
      }

      const message = await Message.findOne({ messageId }).select('senderId recipientId channelId').lean();
      if (!message) {
        return socket.emit('reaction:error', {
          code: 'MESSAGE_NOT_FOUND',
          message: 'Message not found',
        });
      }

      await authorizeMessageAccess(message);

      const summary = await addReaction(messageId, userId, emoji);

      // Broadcast reaction:update within 300 ms
      broadcastReactionUpdate(message, summary);

    } catch (err) {
      console.error('[reaction:add] Error:', err);
      socket.emit('reaction:error', {
        code: err instanceof ChatError ? err.code : 'INTERNAL_ERROR',
        message: err.message || 'An unexpected error occurred',
      });
    }
  });

  // ─── reaction:remove ───────────────────────────────────────────────────────
  socket.on('reaction:remove', async ({ messageId, emoji } = {}) => {
    try {
      if (!messageId || !emoji) {
        return socket.emit('reaction:error', {
          code: 'BAD_REQUEST',
          message: 'messageId and emoji are required',
        });
      }

      const message = await Message.findOne({ messageId }).select('senderId recipientId channelId').lean();
      if (!message) {
        return socket.emit('reaction:error', {
          code: 'MESSAGE_NOT_FOUND',
          message: 'Message not found',
        });
      }

      await authorizeMessageAccess(message);

      const summary = await removeReaction(messageId, userId, emoji);

      // Broadcast reaction:update within 300 ms
      broadcastReactionUpdate(message, summary);

    } catch (err) {
      console.error('[reaction:remove] Error:', err);
      socket.emit('reaction:error', {
        code: err instanceof ChatError ? err.code : 'INTERNAL_ERROR',
        message: err.message || 'An unexpected error occurred',
      });
    }
  });
}
