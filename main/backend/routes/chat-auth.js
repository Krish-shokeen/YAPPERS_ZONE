import express from 'express';
import jwt from 'jsonwebtoken';
import { auth } from '../config/firebase.js';
import { ChatError } from '../chat-errors.js';
import User from '../models/User.js';

const router = express.Router();

/**
 * POST /api/chat/token
 *
 * Exchanges a Firebase ID token for a Chat JWT.
 *
 * How it works:
 *   1. Frontend gets a Firebase ID token from firebase.auth().currentUser.getIdToken()
 *   2. Sends it here in the request body
 *   3. We verify it with Firebase Admin SDK
 *   4. Look up the user in MongoDB to get their _id
 *   5. Sign a Chat JWT with CHAT_JWT_SECRET_CURRENT
 *   6. Return it — the frontend stores this and passes it when connecting to Socket.io
 *
 * Why a separate JWT from the existing app JWT?
 *   Socket.io connections are established via WebSocket handshake, not HTTP requests.
 *   The socket auth token needs to be short-lived and chat-scoped. If someone steals
 *   your chat token, they can only connect to the chat — not your entire backend API.
 */
router.post('/token', async (req, res) => {
  try {
    const { firebaseIdToken } = req.body;

    // Requirement 1.3 — missing token
    if (!firebaseIdToken) {
      throw new ChatError(
        'AUTH_TOKEN_MISSING',
        401,
        'Firebase ID token is required in request body'
      );
    }

    // Requirement 1.1 & 1.2 — verify the Firebase token
    // This will throw if the token is expired or invalid
    let decoded;
    try {
      decoded = await auth.verifyIdToken(firebaseIdToken);
    } catch {
      throw new ChatError(
        'AUTH_TOKEN_INVALID',
        401,
        'Firebase ID token is expired or invalid'
      );
    }

    // Look up the user in MongoDB — we need their _id for the Chat JWT payload
    const user = await User.findOne({ firebaseUid: decoded.uid });
    if (!user) {
      throw new ChatError(
        'AUTH_TOKEN_INVALID',
        401,
        'No account found for this Firebase user'
      );
    }

    // Requirement 1.1 — Chat JWT payload must contain userId, firebaseUid, email, displayName
    // exp = iat + 86400 (24 hours)
    const chatJwt = jwt.sign(
      {
        userId: user._id.toString(),
        firebaseUid: user.firebaseUid,
        email: user.email,
        displayName: user.displayName,
      },
      process.env.CHAT_JWT_SECRET_CURRENT,
      { expiresIn: '24h' }
    );

    res.json({ chatJwt, expiresIn: 86400 });

  } catch (err) {
    // If we threw a ChatError, format it correctly
    if (err instanceof ChatError) {
      return res.status(err.statusCode).json({
        code: err.code,
        message: err.message,
      });
    }
    // Unexpected error
    console.error('Chat token error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to issue chat token' });
  }
});

export default router;
