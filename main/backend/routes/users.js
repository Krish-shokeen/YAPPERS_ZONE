import express from 'express';
import User from '../models/User.js';
import { ChatError } from '../chat-errors.js';
import { getStatuses, setStatusMode } from '../services/presence.service.js';
import { getContactRooms } from '../socket/handlers/presence.handler.js';
import { io } from '../socket/index.js';
import { auth } from '../config/firebase.js';

const router = express.Router();

// Helper to merge live Redis presence into user status modes
async function mergeLiveStatuses(users) {
  if (!users || users.length === 0) return users;
  const userIds = users.map(u => (u._id || u.id).toString());
  try {
    const liveStatuses = await getStatuses(userIds);
    return users.map(u => {
      const uid = (u._id || u.id).toString();
      const isOnline = liveStatuses[uid] === 'online';
      let statusMode = 'offline';
      if (isOnline) {
        statusMode = (u.statusMode === 'offline' || !u.statusMode) ? 'online' : u.statusMode;
      }
      return { ...u, statusMode };
    });
  } catch (err) {
    console.error('[users.js] mergeLiveStatuses error:', err);
    return users;
  }
}

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

    const resultsWithLive = await mergeLiveStatuses(results);

    const users = resultsWithLive.map((u) => {
      const uid = (u._id || u.id).toString();
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
    const targetUserId = req.params.userId;
    const currentUserId = req.user.userId;

    const user = await User.findById(targetUserId)
      .select('_id displayName yapperHandle photoURL statusMode statusText friendRequests friends createdAt')
      .lean();

    if (!user) throw new ChatError('USER_NOT_FOUND', 404, 'User not found');

    const me = await User.findById(currentUserId).select('friends').lean();
    const myFriendIds = (me?.friends || []).map((id) => id.toString());

    const isFriend = myFriendIds.includes(targetUserId);
    const isPending = (user.friendRequests || []).some((id) => id.toString() === currentUserId);

    const [userWithLive] = await mergeLiveStatuses([user]);

    res.json({
      user: {
        id: userWithLive._id,
        displayName: userWithLive.displayName,
        yapperHandle: userWithLive.yapperHandle,
        photoURL: userWithLive.photoURL,
        statusMode: userWithLive.statusMode,
        statusText: userWithLive.statusText,
        createdAt: userWithLive.createdAt,
        isFriend,
        isPending,
      }
    });
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
      .populate('friendRequests', '_id displayName yapperHandle photoURL statusMode')
      .lean();

    if (!user) throw new ChatError('USER_NOT_FOUND', 404, 'User not found');

    if (user.friends) {
      user.friends = await mergeLiveStatuses(user.friends);
    }
    if (user.friendRequests) {
      user.friendRequests = await mergeLiveStatuses(user.friendRequests);
    }

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
      if (statusMode === 'offline') {
        update.lastSeenAt = new Date();
      }
    }

    const user = await User.findByIdAndUpdate(req.user.userId, update, { new: true })
      .select('statusText statusMode lastSeenAt')
      .lean();

    if (statusMode !== undefined) {
      const liveStatusUpdated = await setStatusMode(req.user.userId, statusMode);
      if (liveStatusUpdated && io) {
        const audience = await getContactRooms(req.user.userId);
        const lastSeenAtStr = statusMode === 'offline' ? (user.lastSeenAt || new Date()).toISOString() : undefined;
        audience.forEach((roomId) => {
          io.to(roomId).emit('presence:update', { userId: req.user.userId, status: statusMode, lastSeenAt: lastSeenAtStr });
        });
      }
    }

    res.json({ statusText: user.statusText, statusMode: user.statusMode, lastSeenAt: user.lastSeenAt });
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

// ─── POST /api/users/:userId/decline-friend ────────────────────────────────
// Decline/Ignore a friend request
router.post('/:userId/decline-friend', async (req, res) => {
  try {
    const requesterId = req.params.userId;
    const currentId   = req.user.userId;

    // Just remove from friendRequests list
    await User.updateOne(
      { _id: currentId },
      { $pull: { friendRequests: requesterId } }
    );

    res.json({ message: 'Friend request declined' });
  } catch (err) {
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to decline request' });
  }
});

// ─── DELETE /api/users/me ──────────────────────────────────────────────────
// Delete current user account from MongoDB and Firebase
router.delete('/me', async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const firebaseUid   = req.user.firebaseUid;

    if (!currentUserId || !firebaseUid) {
      throw new ChatError('UNAUTHORIZED', 401, 'Unauthorized access');
    }

    // 1. Delete from Firebase Authentication
    try {
      await auth.deleteUser(firebaseUid);
      console.log(`[DeleteAccount] Firebase user ${firebaseUid} deleted successfully`);
    } catch (firebaseErr) {
      console.error(`[DeleteAccount] Failed to delete Firebase user ${firebaseUid}:`, firebaseErr.message);
    }

    // 2. Remove user from all friends lists and friendRequests lists of other users
    await User.updateMany(
      { $or: [ { friends: currentUserId }, { friendRequests: currentUserId } ] },
      { $pull: { friends: currentUserId, friendRequests: currentUserId } }
    );

    // 3. Delete user document from MongoDB
    await User.findByIdAndDelete(currentUserId);
    console.log(`[DeleteAccount] MongoDB user ${currentUserId} deleted successfully`);

    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (err) {
    console.error('[DELETE /users/me]', err);
    if (err instanceof ChatError) return res.status(err.statusCode).json({ code: err.code, message: err.message });
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to delete account' });
  }
});

export default router;
