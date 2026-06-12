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
    if (!chatSocket?.socket?.current || contactIds.length === 0) return;

    const socket = chatSocket.socket.current;

    // Ask the server for current statuses of all our contacts
    socket.emit('presence:query', { userIds: contactIds });

    // One-time handler for the response
    const handleStatuses = (statusMap) => {
      setStatuses(statusMap);
    };
    socket.once('presence:statuses', handleStatuses);

    return () => socket.off('presence:statuses', handleStatuses);
  }, [chatSocket?.socket, contactIds.join(',')]);

  // Live updates — Requirement 5.8
  useEffect(() => {
    if (!chatSocket?.on) return;

    const unsub = chatSocket.on('presence:update', ({ userId, status }) => {
      setStatuses((prev) => ({ ...prev, [userId]: status }));
    });

    return unsub;
  }, [chatSocket?.on]);

  const getStatus = useCallback(
    (userId) => statuses[userId] || 'offline',
    [statuses]
  );

  return { statuses, getStatus };
}
