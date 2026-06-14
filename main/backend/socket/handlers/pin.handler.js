import { Message, ChannelMember } from '../../services/message.service.js';
import { ChatError } from '../../chat-errors.js';

/**
 * Pin Handler — registers socket events for pinning and unpinning messages.
 *
 * Events:
 *   message:pin        (client → server) — pin a message
 *   message:unpin      (client → server) — unpin a message
 *   message:pin-update (server → client) — broadcast pinning updates
 *   pin:error          (server → client) — error during pin/unpin handling
 */
export function registerPinHandlers(socket, io) {
  const { userId } = socket.user;

  // Helper to verify user is allowed to pin/unpin a message in the conversation
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

  // Helper to broadcast message:pin-update
  function broadcastPinUpdate(message, summary) {
    if (message.channelId) {
      io.to(message.channelId.toString()).emit('message:pin-update', summary);
    } else if (message.recipientId) {
      io.to(message.senderId.toString())
        .to(message.recipientId.toString())
        .emit('message:pin-update', summary);
    }
  }

  // ─── message:pin ───────────────────────────────────────────────────────────
  socket.on('message:pin', async ({ messageId } = {}) => {
    try {
      if (!messageId) {
        return socket.emit('pin:error', {
          code: 'BAD_REQUEST',
          message: 'messageId is required',
        });
      }

      const message = await Message.findOne({ messageId });
      if (!message) {
        return socket.emit('pin:error', {
          code: 'MESSAGE_NOT_FOUND',
          message: 'Message not found',
        });
      }

      await authorizeMessageAccess(message);

      message.isPinned = true;
      await message.save();

      broadcastPinUpdate(message, { messageId, isPinned: true });
    } catch (err) {
      console.error('[message:pin] Error:', err);
      socket.emit('pin:error', {
        code: err instanceof ChatError ? err.code : 'INTERNAL_ERROR',
        message: err.message || 'An unexpected error occurred',
      });
    }
  });

  // ─── message:unpin ──────────────────────────────────────────────────────────
  socket.on('message:unpin', async ({ messageId } = {}) => {
    try {
      if (!messageId) {
        return socket.emit('pin:error', {
          code: 'BAD_REQUEST',
          message: 'messageId is required',
        });
      }

      const message = await Message.findOne({ messageId });
      if (!message) {
        return socket.emit('pin:error', {
          code: 'MESSAGE_NOT_FOUND',
          message: 'Message not found',
        });
      }

      await authorizeMessageAccess(message);

      message.isPinned = false;
      await message.save();

      broadcastPinUpdate(message, { messageId, isPinned: false });
    } catch (err) {
      console.error('[message:unpin] Error:', err);
      socket.emit('pin:error', {
        code: err instanceof ChatError ? err.code : 'INTERNAL_ERROR',
        message: err.message || 'An unexpected error occurred',
      });
    }
  });
}
