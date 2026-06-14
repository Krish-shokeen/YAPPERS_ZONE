import { insertThreadReply, Message, ChannelMember } from '../../services/message.service.js';
import { ChatError } from '../../chat-errors.js';

/**
 * Thread Handler — registers socket events for message threads.
 *
 * Events:
 *   thread:send    (client → server) — post a thread reply
 *   thread:message (server → client) — broadcast reply to participants
 *   thread:error   (server → client) — error during reply handling
 */
export function registerThreadHandlers(socket, io) {
  const { userId, displayName } = socket.user;

  socket.on('thread:send', async (data, ack) => {
    try {
      const { parentMessageId, content, encryptedPayload } = data || {};

      if (!parentMessageId) {
        return socket.emit('thread:error', {
          code: 'BAD_REQUEST',
          message: 'parentMessageId is required',
        });
      }

      // Find parent message by UUID messageId
      const parentMessage = await Message.findOne({ messageId: parentMessageId });
      if (!parentMessage) {
        return socket.emit('thread:error', {
          code: 'MESSAGE_NOT_FOUND',
          message: 'Parent message not found',
        });
      }

      // Authorize access
      if (parentMessage.channelId) {
        const isMember = await ChannelMember.exists({ channelId: parentMessage.channelId, userId });
        if (!isMember) {
          return socket.emit('thread:error', {
            code: 'NOT_A_MEMBER',
            message: 'You are not a member of this channel',
          });
        }
      } else if (parentMessage.recipientId) {
        const sId = parentMessage.senderId.toString();
        const rId = parentMessage.recipientId.toString();
        if (sId !== userId.toString() && rId !== userId.toString()) {
          return socket.emit('thread:error', {
            code: 'UNAUTHORIZED',
            message: 'You are not authorized to access this conversation',
          });
        }
      }

      // Enforce content limits inside insertThreadReply
      const reply = await insertThreadReply(parentMessage._id, {
        senderId: userId,
        content,
        encryptedPayload,
      });

      const replyPayload = {
        messageId: reply.messageId,
        parentMessageId: parentMessageId,
        from: userId,
        fromDisplayName: displayName,
        content: reply.content,
        encryptedPayload: reply.encryptedPayload,
        isEncrypted: reply.isEncrypted,
        deliveryStatus: 'sent',
        createdAt: reply.createdAt,
      };

      // Broadcast thread:message to conversation participants
      if (parentMessage.channelId) {
        io.to(parentMessage.channelId.toString()).emit('thread:message', replyPayload);
      } else if (parentMessage.recipientId) {
        io.to(parentMessage.senderId.toString())
          .to(parentMessage.recipientId.toString())
          .emit('thread:message', replyPayload);
      }

      if (typeof ack === 'function') {
        ack({ messageId: reply.messageId, status: 'sent' });
      }

    } catch (err) {
      console.error('[thread:send] Error:', err);
      socket.emit('thread:error', {
        code: err instanceof ChatError ? err.code : 'INTERNAL_ERROR',
        message: err.message || 'An unexpected error occurred',
      });
    }
  });
}
