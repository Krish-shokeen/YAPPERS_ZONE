import {
  createSession, getSession, updateSession, deleteSession,
  isInActiveCall, MISS_TIMEOUT, ICE_TIMEOUT,
} from '../../services/webrtc.service.js';

/**
 * WebRTC Call Handler — pure signaling relay.
 * No media passes through the server. We only relay SDP offers/answers
 * and ICE candidates between the two peers.
 *
 * Requirements 11.1–11.8
 *
 * Events:
 *   call:invite   → validate, store session, relay call:incoming to recipient
 *   call:accept   → relay SDP answer, start ICE timeout
 *   call:ice      → relay ICE candidate to peer
 *   call:end      → emit call:ended to other party, clean up session
 */
export function registerCallHandlers(socket, io) {
  const { userId, displayName } = socket.user;

  // ─── call:invite ────────────────────────────────────────────────────────────
  socket.on('call:invite', async ({ recipientId, sdpOffer, callType } = {}) => {
    // Requirement 11.2 — validate callType
    if (!['audio', 'video'].includes(callType)) {
      return socket.emit('call:error', { code: 'INVALID_CALL_TYPE', message: 'callType must be audio or video' });
    }

    // Requirement 11.2 — recipient must be connected
    const recipientSockets = await io.in(recipientId).fetchSockets();
    if (recipientSockets.length === 0) {
      return socket.emit('call:error', { code: 'RECIPIENT_OFFLINE', message: 'Recipient is not connected' });
    }

    // Requirement 11.8 — check if recipient is already in a call
    const busy = await isInActiveCall(recipientId);
    if (busy) {
      return socket.emit('call:busy', { recipientId });
    }

    // Create the call session in Redis
    const callId = await createSession(userId, recipientId, callType, sdpOffer);

    // Relay to recipient
    io.to(recipientId).emit('call:incoming', {
      callId, from: userId, fromDisplayName: displayName, sdpOffer, callType,
    });

    // Requirement 11.6 — 30s miss timer
    const missTimer = setTimeout(async () => {
      const session = await getSession(callId);
      if (session && session.state === 'pending') {
        await deleteSession(callId);
        socket.emit('call:missed', { callId });
      }
    }, MISS_TIMEOUT);

    // Store the timer reference so call:accept can cancel it
    socket._callTimers = socket._callTimers || {};
    socket._callTimers[callId] = missTimer;
  });

  // ─── call:accept ────────────────────────────────────────────────────────────
  socket.on('call:accept', async ({ callId, sdpAnswer } = {}) => {
    if (!callId) return;

    const session = await getSession(callId);
    if (!session) {
      return socket.emit('call:error', { callId, code: 'SESSION_NOT_FOUND', message: 'Call session expired' });
    }

    // Mark session as active
    await updateSession(callId, { state: 'active', sdpAnswer });

    // Cancel the miss timer on the caller's socket
    const callerSockets = await io.in(session.callerId).fetchSockets();
    for (const cs of callerSockets) {
      if (cs._callTimers?.[callId]) {
        clearTimeout(cs._callTimers[callId]);
        delete cs._callTimers[callId];
      }
    }

    // Relay SDP answer to caller
    io.to(session.callerId).emit('call:accepted', { callId, sdpAnswer });

    // Requirement 11.3 — 30s ICE timeout
    const iceTimer = setTimeout(async () => {
      const s = await getSession(callId);
      if (s && s.state === 'active') {
        await deleteSession(callId);
        io.to(session.callerId).emit('call:error', { callId, code: 'ICE_TIMEOUT' });
        io.to(session.recipientId).emit('call:error', { callId, code: 'ICE_TIMEOUT' });
      }
    }, ICE_TIMEOUT);

    socket._callTimers = socket._callTimers || {};
    socket._callTimers[`ice:${callId}`] = iceTimer;
  });

  // ─── call:ice ────────────────────────────────────────────────────────────────
  socket.on('call:ice', async ({ callId, candidate } = {}) => {
    if (!callId || !candidate) return;

    const session = await getSession(callId);
    if (!session) return;

    // Relay ICE candidate to the other peer
    const otherUserId = session.callerId === userId ? session.recipientId : session.callerId;
    io.to(otherUserId).emit('call:ice', { callId, candidate });
  });

  // ─── call:end ────────────────────────────────────────────────────────────────
  socket.on('call:end', async ({ callId } = {}) => {
    if (!callId) return;

    const session = await getSession(callId);
    if (session) {
      const otherUserId = session.callerId === userId ? session.recipientId : session.callerId;
      io.to(otherUserId).emit('call:ended', { callId });
      await deleteSession(callId);
    }

    // Clean up any pending timers
    if (socket._callTimers) {
      clearTimeout(socket._callTimers[callId]);
      clearTimeout(socket._callTimers[`ice:${callId}`]);
      delete socket._callTimers[callId];
      delete socket._callTimers[`ice:${callId}`];
    }
  });
}
