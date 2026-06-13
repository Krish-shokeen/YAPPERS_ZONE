import express from 'express';
import User from '../models/User.js';
import { ChatError } from '../chat-errors.js';

const router = express.Router();

// ─── GET /api/users/search?q=krish ────────────────────────────────────────
/**
 * User search — prefix-match on yapperHandle or displayName.
 *
 * Performance strategy:
 *   1. MongoDB index on yapperHandle + displayName (fast prefix scan)
 *   2. Redis cache of recent searches (TODO: production upgrade)
 *   3. Frontend debounces 300ms before calling — prevents overload
 *
 * Returns up to 10 results with: id, displayName, yapperHandle, photoURL,
 * statusMode, statusText, and whether the requesting user has sent a request.
 */
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    const currentUserId = req.user.userId;

    if (!q || q.trim().length < 1) {
      return res.json({ users: [] });
    }

    const query = q.trim();
    const escapedQ = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Search by handle (e.g. "krish#9999") or display name prefix
    const results = await User.find({
      _id: { $ne: currentUserId }, // exclude self
      $or: [
        { yapperHandle: { $regex: `^${escapedQ}`, $options: 'i' } },
        { displayName:  { $regex: `^${escapedQ}`, $options: 'i' } },
      ],
    })
      .select('_id displayName yapperHandle photoURL statusMode statusText friendRequests friends')
      .limit(10)
      .lean();

    // Get the current user's sent requests
    const me = await User.findById(currentUserId)
      .select('friends friendRequests')
      .lean();

    const myFriendIds  = (me?.friends || []).map((id) => id.toString());
    const myRequestIds = (me?.friendRequests || []).map((id) => id.toString());

    const users = results.map((u) => {
      const uid = u._id.toString();
      const isFriend  = myFriendIds.includes(uid);
      // Check if THIS user has a pending request from me in THEIR friendRequests
      const isPending = (u.friendRequests || []).some((id) => id.toString() === currentUserId);

      return {
        id:           uid,
        displayName:  u.displayName,
        yapperHandle: u.yapperHandle,
        photoURL:     u.photoURL,
        statusMode:   u.statusMode,
        statusText:   u.statusText,
        isFriend,
        isPending,
      };
    });

    res.json({ users });
  } catch (err) {
    console.error('[GET /users/search]', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Search failed' });
  }
});

// ─── GET /api/users/:userId ────────────────────────────────────────────────
// Get a user's public profile
router.get('/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('_id displayName yapperHandle photoURL statusMode statusText createdAt')
      .lean();

    if (!user) throw new ChatError('USER_NOT_FOUND', 404, 'User not found');

    res.json({ user });
  } catch (err) {
    if (err instanceof ChatError) return res.status(err.statusCode).json({ code: err.code, message: err.message });
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to fetch user' });
  }
});

// ─── GET /api/users/me/profile ─────────────────────────────────────────────
// Get the current user's full profile
router.get('/me/profile', async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .populate('friends', '_id displayName yapperHandle photoURL statusMode')
      .lean();

    if (!user) throw new ChatError('USER_NOT_FOUND', 404, 'User not found');
    res.json({ user });
  } catch (err) {
    if (err instanceof ChatError) return res.status(err.statusCode).json({ code: err.code, message: err.message });
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to fetch profile' });
  }
});

// ─── PATCH /api/users/me/status ───────────────────────────────────────────
// Update status text and mode
router.patch('/me/status', async (req, res) => {
  try {
    const { statusText, statusMode } = req.body;
    const update = {};
    if (statusText !== undefined) update.statusText = statusText.slice(0, 128);
    if (statusMode  !== undefined) {
      if (!['online', 'idle', 'dnd', 'offline'].includes(statusMode)) {
        throw new ChatError('INVALID_STATUS', 400, 'Invalid status mode');
      }
      update.statusMode = statusMode;
    }

    const user = await User.findByIdAndUpdate(req.user.userId, update, { new: true })
      .select('statusText statusMode')
      .lean();

    res.json({ statusText: user.statusText, statusMode: user.statusMode });
  } catch (err) {
    if (err instanceof ChatError) return res.status(err.statusCode).json({ code: err.code, message: err.message });
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to update status' });
  }
});

// ─── POST /api/users/:userId/friend-request ───────────────────────────────
// Send a friend request
router.post('/:userId/friend-request', async (req, res) => {
  try {
    const targetId  = req.params.userId;
    const currentId = req.user.userId;

    if (targetId === currentId) {
      throw new ChatError('INVALID_REQUEST', 400, 'Cannot add yourself');
    }

    // Add currentUser to target's friendRequests (if not already there)
    await User.updateOne(
      { _id: targetId, friendRequests: { $ne: currentId } },
      { $push: { friendRequests: currentId } }
    );

    res.json({ message: 'Friend request sent' });
  } catch (err) {
    if (err instanceof ChatError) return res.status(err.statusCode).json({ code: err.code, message: err.message });
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to send request' });
  }
});

// ─── POST /api/users/:userId/accept-friend ────────────────────────────────
// Accept a friend request
router.post('/:userId/accept-friend', async (req, res) => {
  try {
    const requesterId = req.params.userId;
    const currentId   = req.user.userId;

    // Remove from friendRequests, add to friends on both sides
    await User.updateOne(
      { _id: currentId },
      { $pull: { friendRequests: requesterId }, $addToSet: { friends: requesterId } }
    );
    await User.updateOne(
      { _id: requesterId },
      { $addToSet: { friends: currentId } }
    );

    res.json({ message: 'Friend added' });
  } catch (err) {
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to accept request' });
  }
});

export default router;
