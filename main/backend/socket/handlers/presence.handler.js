import {
  setOnline, setOffline, renewPresence,
  setTyping, clearTyping, getTypingUsers, getStatuses,
} from '../../services/presence.service.js';
import { ChannelMember } from '../../services/message.service.js';
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
    const audience = await getContactRooms(userId);
    audience.forEach((roomId) => {
      io.to(roomId).emit('presence:update', { userId, status: 'online' });
    });
  })();

  // ─── Heartbeat: renew TTL every 10s ──────────────────────────────────────
  const heartbeatTimer = setInterval(() => renewPresence(userId), HEARTBEAT_INTERVAL);

  // ─── On disconnect: go offline ────────────────────────────────────────────
  socket.on('disconnect', async () => {
    clearInterval(heartbeatTimer);
    await setOffline(userId);
    const audience = await getContactRooms(userId);
    audience.forEach((roomId) => {
      io.to(roomId).emit('presence:update', { userId, status: 'offline' });
    });
  });

  // ─── Presence query: initial Sidebar load ────────────────────────────────
  // Requirement 5.7 — frontend queries statuses before events arrive
  socket.on('presence:query', async ({ userIds } = {}) => {
    if (!Array.isArray(userIds) || userIds.length === 0) return;
    const statuses = await getStatuses(userIds.slice(0, 500));
    socket.emit('presence:statuses', statuses);
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
 * For simplicity we use channel memberships as the broadcast audience.
 */
async function getContactRooms(userId) {
  try {
    const memberships = await ChannelMember.find({ userId }).select('channelId').lean();
    const channelIds = memberships.map((m) => m.channelId);

    // Get all other members of those channels
    const others = await ChannelMember.find({
      channelId: { $in: channelIds },
      userId: { $ne: new mongoose.Types.ObjectId(userId) },
    }).select('userId').lean();

    // Return unique userIds (personal rooms)
    const unique = [...new Set(others.map((o) => o.userId.toString()))];
    return unique;
  } catch {
    return [];
  }
}
