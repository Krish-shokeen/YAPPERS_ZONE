import express from 'express';
import mongoose from 'mongoose';
import { ChatError } from '../chat-errors.js';

const router = express.Router();

// ─── Encryption Key Schema ─────────────────────────────────────────────────────

const encryptionKeySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    publicKey: { type: String, required: true }, // base64 X25519 public key
  },
  { timestamps: true }
);

const EncryptionKey = mongoose.model('EncryptionKey', encryptionKeySchema);

// ─── POST /api/encryption/keys ────────────────────────────────────────────────
/**
 * Requirement 9.1 — upload / update the user's public key.
 * Idempotent — safe to call again on the same device.
 *
 * Body: { publicKey: string } — base64 X25519 public key
 */
router.post('/keys', async (req, res) => {
  try {
    const { publicKey } = req.body;
    if (!publicKey) {
      throw new ChatError('KEY_MISSING', 400, 'publicKey is required');
    }

    await EncryptionKey.findOneAndUpdate(
      { userId: req.user.userId },
      { publicKey },
      { upsert: true, new: true }
    );

    res.json({ message: 'Public key stored successfully' });

  } catch (err) {
    if (err instanceof ChatError) {
      return res.status(err.statusCode).json({ code: err.code, message: err.message });
    }
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to store key' });
  }
});

// ─── GET /api/encryption/keys/:userId ─────────────────────────────────────────
/**
 * Requirement 9.2 — retrieve another user's public key for E2E encryption.
 */
router.get('/keys/:userId', async (req, res) => {
  try {
    const record = await EncryptionKey.findOne({ userId: req.params.userId }).lean();
    if (!record) {
      throw new ChatError('KEY_NOT_FOUND', 404, 'No public key found for this user');
    }
    res.json({ userId: req.params.userId, publicKey: record.publicKey });

  } catch (err) {
    if (err instanceof ChatError) {
      return res.status(err.statusCode).json({ code: err.code, message: err.message });
    }
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to fetch key' });
  }
});

export default router;
