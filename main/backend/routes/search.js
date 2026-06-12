import express from 'express';
import { searchMessages } from '../services/search.service.js';
import { ChatError } from '../chat-errors.js';

const router = express.Router();

/**
 * GET /api/search/messages
 *
 * Query params:
 *   q            (required) — search term, 2–200 chars
 *   sender       (optional) — filter by senderId
 *   channelId    (optional) — filter to a channel
 *   fromDate     (optional) — ISO date string
 *   toDate       (optional) — ISO date string
 *   hasAttachment (optional) — 'true' to only return messages with files
 *   page         (optional) — page number, default 1
 */
router.get('/messages', async (req, res) => {
  try {
    const { q, sender, channelId, fromDate, toDate, hasAttachment, page } = req.query;
    const userId = req.user.userId;

    const result = await searchMessages({
      userId,
      q,
      sender,
      channelId,
      fromDate,
      toDate,
      hasAttachment: hasAttachment === 'true',
      page: parseInt(page) || 1,
    });

    res.json(result);

  } catch (err) {
    if (err instanceof ChatError) {
      return res.status(err.statusCode).json({ code: err.code, message: err.message });
    }
    console.error('[GET /search/messages]', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Search failed' });
  }
});

export default router;
