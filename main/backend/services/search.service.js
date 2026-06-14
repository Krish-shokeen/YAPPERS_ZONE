import { Message, ChannelMember } from './message.service.js';
import { ChatError } from '../chat-errors.js';
import mongoose from 'mongoose';

/**
 * searchMessages — full-text search with optional filters.
 *
 * Requirements 10.1–10.7:
 *   - Results scoped to conversations the user participates in
 *   - AND-logic for all filters
 *   - Encrypted messages excluded from results
 *   - Returns highlights (matched term + ≤100 chars context)
 *   - Responds within 500ms for up to 10M messages
 *
 * @param {object} options
 *   userId      (string)  — the requesting user (scopes results)
 *   q           (string)  — search query (2–200 chars)
 *   sender      (string)  — filter by senderId
 *   channelId   (string)  — filter to a specific channel
 *   fromDate    (string)  — ISO date — messages on/after this date
 *   toDate      (string)  — ISO date — messages on/before this date
 *   page        (number)  — page number (1-based), 20 results per page
 */
export async function searchMessages({
  userId, q, sender, channelId, fromDate, toDate, page = 1,
}) {
  // Requirement 10.5 — query length validation
  if (!q || q.length < 2) {
    throw new ChatError('QUERY_INVALID', 400, 'Search query must be at least 2 characters');
  }
  if (q.length > 200) {
    throw new ChatError('QUERY_INVALID', 400, 'Search query cannot exceed 200 characters');
  }

  // Requirement 10.3 — date range validation
  if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
    throw new ChatError('INVALID_DATE_RANGE', 400, 'fromDate cannot be after toDate');
  }

  const PAGE_SIZE = 20;

  // ── Scope: find all channelIds the user is a member of ──
  const memberships = await ChannelMember.find({ userId }).select('channelId').lean();
  const userChannelIds = memberships.map((m) => m.channelId);

  // Build the query
  const query = {
    // Requirement 10.6 — never search encrypted messages
    isEncrypted: false,
    isDeleted: false,
    // Scope to conversations the user participates in
    $or: [
      { senderId: new mongoose.Types.ObjectId(userId) },
      { recipientId: new mongoose.Types.ObjectId(userId) },
      { channelId: { $in: userChannelIds } },
    ],
    // MongoDB full-text search
    $text: { $search: q },
  };

  // Requirement 10.2 — AND-logic for all filters
  if (sender) query.senderId = new mongoose.Types.ObjectId(sender);
  if (channelId) query.channelId = new mongoose.Types.ObjectId(channelId);
  if (fromDate || toDate) {
    query.createdAt = {};
    if (fromDate) query.createdAt.$gte = new Date(fromDate);
    if (toDate) query.createdAt.$lte = new Date(toDate);
  }

  // Execute with text score for relevance ranking (Requirement 10.1)
  const [messages, total] = await Promise.all([
    Message.find(query, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    Message.countDocuments(query),
  ]);

  // Requirement 10.4 — generate highlights (matched terms + ≤100 chars context)
  const results = messages.map((msg) => ({
    messageId: msg.messageId,
    senderId: msg.senderId,
    channelId: msg.channelId,
    recipientId: msg.recipientId,
    content: msg.content,
    createdAt: msg.createdAt,
    highlight: extractHighlight(msg.content, q),
  }));

  // Requirement 10.7 — return empty list (not error) when no results
  return { results, total, page, pageSize: PAGE_SIZE };
}

/**
 * extractHighlight — find the query term in content and return
 * up to 100 characters of surrounding context.
 */
function extractHighlight(content, query) {
  if (!content) return '';
  const terms = query.trim().split(/\s+/);
  const firstTerm = terms[0];
  const idx = content.toLowerCase().indexOf(firstTerm.toLowerCase());
  if (idx === -1) return content.slice(0, 100);
  const start = Math.max(0, idx - 40);
  const end = Math.min(content.length, idx + 60);
  return (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
}
