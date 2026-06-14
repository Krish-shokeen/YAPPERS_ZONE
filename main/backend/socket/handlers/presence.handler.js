import {
  setOnline, setOffline, renewPresence,
  setTyping, clearTyping, getTypingUsers, getStatuses,
} from '../../services/presence.service.js';
import { ChannelMember } from '../../services/message.service.js';
import User from '../../models/User.js';
import mongoose from 'mongoose';

const HEARTBEAT_INTERVAL = 10_000; // 10 seconds

/**
 * registerPresenceHandlers — presence and typing socket events.
 *
 * Presence lifecycle (Requirements 5.1–5.4):
 *   connect    → setOnline → broadcast presence:update { online }
 *   disconnect → setOffline → broadcast presence:update { offline }
 *   heartbeat  → renewPresence (keeps TTL alive)
 *   no heartbeat for 10s → Redis TTL expires → effectively offline
 *
 * Typing lifecycle (Requirements 6.1–6.8):
 *   typing:start → setTyping (3s TTL) → broadcast typing:started
 *   typing:stop  → clearTyping → broadcast typing:stopped
 *   3s no typing:start → Redis TTL fires → typing:stopped auto-broadcast
 */
export function registerPresenceHandlers(socket, io) {
  const { userId, displayName } = socket.user;

  // ─── On connect: go online ────────────────────────────────────────────────
  (async () => {
    await setOnline(userId);
    let status = 'online';
    try {
      const userDoc = await User.findById(userId).select('statusMode').lean();
      if (userDoc?.statusMode && userDoc.statusMode !== 'offline') {
        status = userDoc.statusMode;
      }
    } catch (err) {
      console.error('[presence.handler] Error fetching statusMode on connect:', err);
    }
    const audience = await getContactRooms(userId);
    audience.forEach((roomId) => {
      io.to(roomId).emit('presence:update', { userId, status });
    });
  })();

  // ─── Heartbeat: renew TTL every 10s ──────────────────────────────────────
  const heartbeatTimer = setInterval(() => renewPresence(userId), HEARTBEAT_INTERVAL);

  // ─── On disconnect: go offline ────────────────────────────────────────────
  socket.on('disconnect', async () => {
    clearInterval(heartbeatTimer);
    await setOffline(userId);
    const now = new Date();
    try {
      await User.findByIdAndUpdate(userId, {
        statusMode: 'offline',
        lastSeenAt: now,
      });
    } catch (err) {
      console.error('[presence.handler] Error updating lastSeenAt on disconnect:', err);
    }
    const audience = await getContactRooms(userId);
    audience.forEach((roomId) => {
      io.to(roomId).emit('presence:update', { userId, status: 'offline', lastSeenAt: now.toISOString() });
    });
  });

  // ─── Presence query: initial Sidebar load ────────────────────────────────
  // Requirement 5.7 — frontend queries statuses before events arrive
  socket.on('presence:query', async ({ userIds } = {}) => {
    if (!Array.isArray(userIds) || userIds.length === 0) return;
    try {
      const redisStatuses = await getStatuses(userIds.slice(0, 500));
      const users = await User.find({ _id: { $in: userIds } }).select('_id statusMode lastSeenAt').lean();
      const statuses = {};
      users.forEach((u) => {
        const idStr = u._id.toString();
        const live = redisStatuses[idStr];
        statuses[idStr] = {
          status: live === 'online' ? (u.statusMode || 'online') : 'offline',
          lastSeenAt: u.lastSeenAt || null,
        };
      });
      socket.emit('presence:statuses', statuses);
    } catch (err) {
      console.error('[presence.handler] presence:query error:', err);
      const statuses = {};
      userIds.forEach((id) => {
        statuses[id] = { status: 'offline', lastSeenAt: null };
      });
      socket.emit('presence:statuses', statuses);
    }
  });

  // ─── Typing: start ────────────────────────────────────────────────────────
  socket.on('typing:start', async ({ conversationId } = {}) => {
    if (!conversationId) return;
    await setTyping(conversationId, userId);
    // Broadcast to everyone in the conversation except the sender
    socket.to(conversationId).emit('typing:started', { conversationId, userId, displayName });
  });

  // ─── Typing: stop ─────────────────────────────────────────────────────────
  socket.on('typing:stop', async ({ conversationId } = {}) => {
    if (!conversationId) return;
    await clearTyping(conversationId, userId);
    socket.to(conversationId).emit('typing:stopped', { conversationId, userId });
  });
}

/**
 * getContactRooms — returns all personal room IDs (userIds) that share
 * a DM or channel with the given user.
 *
 * These are the rooms that should receive presence:update events.
 */
export async function getContactRooms(userId) {
  try {
    const memberships = await ChannelMember.find({ userId }).select('channelId').lean();
    const channelIds = memberships.map((m) => m.channelId);

    // Get all other members of those channels
    const others = await ChannelMember.find({
      channelId: { $in: channelIds },
      userId: { $ne: new mongoose.Types.ObjectId(userId) },
    }).select('userId').lean();

    // Get friends
    const userDoc = await User.findById(userId).select('friends').lean();
    const friendIds = userDoc?.friends ? userDoc.friends.map((f) => f.toString()) : [];

    // Return unique userIds (personal rooms)
    const allIds = others.map((o) => o.userId.toString()).concat(friendIds);
    const unique = [...new Set(allIds)];
    return unique;
  } catch (err) {
    console.error('[presence.handler] getContactRooms error:', err);
    return [];
  }
}
