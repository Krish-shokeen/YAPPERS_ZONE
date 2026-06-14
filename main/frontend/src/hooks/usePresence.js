import { useState, useEffect, useCallback } from 'react';

/**
 * usePresence — tracks online/offline status of contacts.
 *
 * Requirements 5.7 + 5.8:
 *   - Queries all contact statuses on mount (before any events arrive)
 *   - Subscribes to presence:update events and updates within 2s
 *
 * @param {object} options
 *   chatSocket  — the useChatSocket return value
 *   contactIds  — array of userIds to track
 *
 * @returns {Record<string, 'online'|'offline'>} statuses map
 */
export function usePresence({ chatSocket, contactIds = [] }) {
  const [statuses, setStatuses] = useState({});

  // Initial query — Requirement 5.7
  useEffect(() => {
    if (!chatSocket?.socketVal || contactIds.length === 0) return;

    const socket = chatSocket.socketVal;

    // Ask the server for current statuses of all our contacts
    socket.emit('presence:query', { userIds: contactIds });

    // One-time handler for the response
    const handleStatuses = (statusMap) => {
      setStatuses(statusMap);
    };
    socket.once('presence:statuses', handleStatuses);

    return () => socket.off('presence:statuses', handleStatuses);
  }, [chatSocket?.socketVal, contactIds.join(',')]);

  // Live updates — Requirement 5.8
  useEffect(() => {
    if (!chatSocket?.on) return;

    const unsub = chatSocket.on('presence:update', ({ userId, status, lastSeenAt }) => {
      setStatuses((prev) => ({
        ...prev,
        [userId]: {
          status,
          lastSeenAt: lastSeenAt || prev[userId]?.lastSeenAt,
        },
      }));
    });

    return unsub;
  }, [chatSocket?.on]);

  const getStatus = useCallback(
    (userId) => statuses[userId]?.status || 'offline',
    [statuses]
  );

  const getLastSeen = useCallback(
    (userId) => statuses[userId]?.lastSeenAt || null,
    [statuses]
  );

  return { statuses, getStatus, getLastSeen };
}
