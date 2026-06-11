import { insertMessage, updateDeliveryStatus, Message } from '../../services/message.service.js';
import { ChatError } from '../../chat-errors.js';

/**
 * DM Handler — registers all direct message socket events.
 *
 * Called once per socket connection from socket/index.js:
 *   registerDmHandlers(socket, io)
 *
 * Events this handler manages:
 *   dm:send    (client → server) — user sends a DM
 *   dm:receive (server → client) — recipient receives a DM
 *   dm:error   (server → client) — something went wrong
 *   status:read (client → server) — recipient read a message
 *   status:update (server → client) — delivery status changed
 */
export function registerDmHandlers(socket, io) {
  const { userId, displayName } = socket.user;

  // ─── dm:send ───────────────────────────────────────────────────────────────
  /**
   * Requirement 2.1 — send a DM to another user
   *
   * Payload: { to: string (userId), content: string, encryptedPayload?: string }
   *
   * Flow:
   *   1. Validate content
   *   2. insertMessage() — saves to MongoDB with deliveryStatus: 'sent'
   *   3. Emit dm:receive to recipient's personal room
   *   4. Socket.io acknowledgement callback (ack) tells us the packet arrived
   *   5. On ack → update status to 'delivered', notify sender
   */
  socket.on('dm:send', async (data, ack) => {
    try {
      const { to, content, encryptedPayload } = data || {};

      // Basic validation — content length is also checked inside insertMessage()
      // but we do a quick check here to fail fast before hitting the DB
      if (!to) {
        return socket.emit('dm:error', {
          code: 'MESSAGE_INVALID',
          message: 'Recipient userId (to) is required',
        });
      }

      // Requirement 2.4 — empty or too-long content
      if (!encryptedPayload) {
        if (!content || content.trim().length === 0) {
          return socket.emit('dm:error', {
            code: 'MESSAGE_INVALID',
            message: 'Message content cannot be empty',
          });
        }
        if (content.length > 4000) {
          return socket.emit('dm:error', {
            code: 'MESSAGE_INVALID',
            message: 'Message content exceeds 4000 characters',
          });
        }
      }

      // Requirement 2.3 + 2.5 — persist message, assign UUIDv4, set deliveryStatus: 'sent'
      let message;
      try {
        message = await insertMessage({
          senderId: userId,
          recipientId: to,
          content,
          encryptedPayload,
        });
      } catch (err) {
        // Requirement 2.6 — DB failure: emit error, do NOT emit dm:receive
        return socket.emit('dm:error', {
          code: err instanceof ChatError ? err.code : 'MESSAGE_PERSIST_FAILED',
          message: err.message,
        });
      }

      // Build the payload the recipient will receive
      const receivePayload = {
        messageId: message.messageId,
        from: userId,
        fromDisplayName: displayName,
        content: message.content,
        encryptedPayload: message.encryptedPayload,
        isEncrypted: message.isEncrypted,
        deliveryStatus: 'sent',
        createdAt: message.createdAt,
      };

      // Requirement 2.1 — emit dm:receive to the recipient's personal room within 300 ms
      // Each user joins a room named after their userId in socket/index.js
      // So io.to(to) reaches any device the recipient is currently connected on
      io.to(to).emit('dm:receive', receivePayload, async (ackError) => {
        // This callback fires if the recipient's socket sends back an acknowledgement.
        // Socket.io calls this with an error if the emit failed, or no args on success.
        if (!ackError) {
          // Requirement 2.7 + 7.2 — recipient received it → update status to 'delivered'
          await updateDeliveryStatus(message.messageId, 'delivered');

          // Requirement 7.3 — tell the sender their message was delivered
          socket.emit('status:update', {
            messageId: message.messageId,
            status: 'delivered',
          });
        }
      });

      // Acknowledge the send back to the sender (lets them show the message optimistically)
      if (typeof ack === 'function') {
        ack({ messageId: message.messageId, status: 'sent' });
      }

    } catch (err) {
      console.error('[dm:send] Unexpected error:', err);
      socket.emit('dm:error', {
        code: 'MESSAGE_PERSIST_FAILED',
        message: 'An unexpected error occurred',
      });
    }
  });

  // ─── status:read ──────────────────────────────────────────────────────────
  /**
   * Requirement 7.4 + 7.5 — recipient's Chat_Pane reports a message was read
   *
   * Payload: { messageId: string }
   *
   * The frontend emits this when a message is ≥50% visible in the viewport.
   * We update the DB and notify the original sender.
   *
   * Idempotency: if this message is already 'read', the update is a no-op.
   */
  socket.on('status:read', async ({ messageId } = {}) => {
    if (!messageId) return;

    try {
      // Find the message to get the original sender's userId
      const message = await Message.findOne({ messageId }).select('senderId deliveryStatus').lean();
      if (!message) return;

      // Don't re-emit if already marked read (idempotence)
      if (message.deliveryStatus === 'read') return;

      await updateDeliveryStatus(messageId, 'read');

      const senderId = message.senderId.toString();

      // Requirement 7.6 — notify the original sender
      // Requirement 7.7 — if sender is offline, io.to() queues until they reconnect
      // (Socket.io delivers to the personal room whenever the sender next connects)
      io.to(senderId).emit('status:update', {
        messageId,
        status: 'read',
      });

    } catch (err) {
      console.error('[status:read] Error:', err);
    }
  });

  // ─── Offline delivery flush ────────────────────────────────────────────────
  /**
   * Requirement 2.2 — when a user connects, deliver any messages sent while offline.
   *
   * We query for messages addressed to this user with deliveryStatus 'sent'
   * (meaning the dm:receive was never acknowledged) and re-emit them now.
   *
   * This runs once per connection, right after the user joins their personal room.
   */
  flushOfflineMessages(socket, io, userId);
}

/**
 * flushOfflineMessages — deliver queued messages to a user who just connected.
 *
 * @param {Socket} socket  - the user's newly connected socket
 * @param {Server} io      - the Socket.io server
 * @param {string} userId  - the connecting user's MongoDB _id
 */
async function flushOfflineMessages(socket, io, userId) {
  try {
    // Find all messages sent to this user that were never delivered
    const pending = await Message.find({
      recipientId: userId,
      deliveryStatus: 'sent',
      isDeleted: false,
    })
      .sort({ createdAt: 1 }) // oldest first so they arrive in order
      .lean();

    if (pending.length === 0) return;

    console.log(`[DM] Flushing ${pending.length} offline messages to user ${userId}`);

    for (const message of pending) {
      socket.emit(
        'dm:receive',
        {
          messageId: message.messageId,
          from: message.senderId.toString(),
          content: message.content,
          encryptedPayload: message.encryptedPayload,
          isEncrypted: message.isEncrypted,
          deliveryStatus: 'sent',
          createdAt: message.createdAt,
        },
        async (ackError) => {
          if (!ackError) {
            await updateDeliveryStatus(message.messageId, 'delivered');
            // Notify the original sender that it was finally delivered
            io.to(message.senderId.toString()).emit('status:update', {
              messageId: message.messageId,
              status: 'delivered',
            });
          }
        }
      );
    }
  } catch (err) {
    console.error('[DM] flushOfflineMessages error:', err);
  }
}
