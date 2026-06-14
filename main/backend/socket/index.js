import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { registerDmHandlers } from './handlers/dm.handler.js';
import { registerChannelHandlers } from './handlers/channel.handler.js';
import { registerPresenceHandlers } from './handlers/presence.handler.js';
import { registerCallHandlers } from './handlers/call.handler.js';
import { registerReactionHandlers } from './handlers/reaction.handler.js';
import { registerThreadHandlers } from './handlers/thread.handler.js';
import { registerPinHandlers } from './handlers/pin.handler.js';

/**
 * Socket.io server — the real-time layer of YAPPERS_ZONE Chat.
 *
 * How the auth flow works:
 *   1. Frontend calls POST /api/chat/token → gets a Chat JWT
 *   2. Frontend connects to Socket.io and passes the JWT in the handshake:
 *        socket = io('http://localhost:5000', { auth: { token: chatJwt } })
 *   3. Our middleware below intercepts the connection BEFORE it's established
 *   4. It verifies the JWT — valid → socket.user is populated, connection allowed
 *                           invalid → auth_error emitted, connection closed (4001)
 *
 * Why close code 4001?
 *   WebSocket close codes 4000-4999 are reserved for application use.
 *   4001 = "authentication failed" — a convention we define for our own clients.
 */

let io; // exported so other modules (handlers) can emit events

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
      credentials: true,
    },
    // How long (ms) the client has to send the first message before being disconnected
    connectTimeout: 10000,
  });

  // ─── Auth Middleware ────────────────────────────────────────────────────────
  // This runs BEFORE the 'connection' event. If next() receives an Error,
  // Socket.io emits 'connect_error' to the client with the error message.
  // We handle it on the client side and close with code 4001.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    // Requirement 1.3 / 1.4 — no token present
    if (!token) {
      const err = new Error('AUTH_TOKEN_MISSING');
      err.data = { code: 'AUTH_TOKEN_MISSING' };
      return next(err);
    }

    // Try the current signing key first
    try {
      const decoded = jwt.verify(token, process.env.CHAT_JWT_SECRET_CURRENT);
      socket.user = decoded; // { userId, firebaseUid, email, displayName, iat, exp }
      return next();
    } catch {
      // Current key failed — try the previous key within the 5-minute overlap window
      // Requirement 1.6 — key rotation overlap
      const prevSecret = process.env.CHAT_JWT_SECRET_PREVIOUS;
      const rotationTs = Number(process.env.CHAT_JWT_ROTATION_TS || 0);
      const overlapSeconds = 300; // 5 minutes

      if (prevSecret && rotationTs > 0) {
        const ageSeconds = Date.now() / 1000 - rotationTs;
        if (ageSeconds < overlapSeconds) {
          try {
            const decoded = jwt.verify(token, prevSecret);
            socket.user = decoded;
            return next();
          } catch {
            // Previous key also failed — fall through to rejection
          }
        }
      }

      // Requirement 1.4 / 1.5 — invalid or expired token
      const err = new Error('AUTH_TOKEN_INVALID');
      err.data = { code: 'AUTH_TOKEN_INVALID' };
      return next(err);
    }
  });

  // ─── Connection Handler ─────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const { userId, displayName } = socket.user;
    console.log(`[Socket] Connected: ${socket.id} | user: ${displayName} (${userId})`);

    // Join a personal room named after the userId.
    // This lets us send events directly to a specific user from anywhere:
    //   io.to(userId).emit('dm:receive', message)
    socket.join(userId);

    // Register all event handlers for this socket
    registerPresenceHandlers(socket, io);
    registerDmHandlers(socket, io);
    registerChannelHandlers(socket, io);
    registerCallHandlers(socket, io);
    registerReactionHandlers(socket, io);
    registerThreadHandlers(socket, io);
    registerPinHandlers(socket, io);

    // Handle clean disconnect
    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Disconnected: ${socket.id} | reason: ${reason}`);
    });

    // If auth middleware rejected the connection, Socket.io emits 'connect_error'
    // on the client. We also listen for any runtime auth errors and close cleanly.
    socket.on('error', (err) => {
      console.error(`[Socket] Error on ${socket.id}:`, err.message);
      if (err.data?.code === 'AUTH_TOKEN_INVALID' || err.data?.code === 'AUTH_TOKEN_MISSING') {
        socket.emit('auth_error', { code: err.data.code });
        socket.disconnect(true);
      }
    });
  });

  return io;
}

// Export io so handlers in other files can call io.to(...).emit(...)
export { io };
