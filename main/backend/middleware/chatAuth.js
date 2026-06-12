import jwt from 'jsonwebtoken';
import { ChatError } from '../chat-errors.js';

/**
 * chatAuthMiddleware — Express middleware that verifies a Chat JWT.
 *
 * Used to protect REST endpoints that are part of the chat system
 * (channels, media, search, encryption keys).
 *
 * Expects: Authorization: Bearer <chatJwt>
 *
 * On success: populates req.user with { userId, firebaseUid, email, displayName }
 * On failure: returns 401 with the appropriate ChatError code
 *
 * This is the same verification logic as socket/index.js auth middleware,
 * just adapted for Express request/response instead of Socket.io.
 */
export function chatAuthMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ChatError('AUTH_TOKEN_MISSING', 401, 'Chat JWT is required');
    }

    const token = authHeader.split(' ')[1];

    // Try current signing key first
    try {
      req.user = jwt.verify(token, process.env.CHAT_JWT_SECRET_CURRENT);
      return next();
    } catch {
      // Try previous key within the 5-minute overlap window (key rotation)
      const prevSecret = process.env.CHAT_JWT_SECRET_PREVIOUS;
      const rotationTs = Number(process.env.CHAT_JWT_ROTATION_TS || 0);

      if (prevSecret && rotationTs > 0) {
        const ageSeconds = Date.now() / 1000 - rotationTs;
        if (ageSeconds < 300) {
          try {
            req.user = jwt.verify(token, prevSecret);
            return next();
          } catch {
            // Previous key also failed
          }
        }
      }

      throw new ChatError('AUTH_TOKEN_INVALID', 401, 'Chat JWT is expired or invalid');
    }

  } catch (err) {
    if (err instanceof ChatError) {
      return res.status(err.statusCode).json({ code: err.code, message: err.message });
    }
    res.status(401).json({ code: 'AUTH_TOKEN_INVALID', message: 'Authentication failed' });
  }
}
