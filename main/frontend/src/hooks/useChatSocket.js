import { useEffect, useRef, useCallback, useState } from 'react';
import { io } from 'socket.io-client';
import { API_BASE_URL } from '../firebaseClient';

const SOCKET_URL = API_BASE_URL.replace('/api', ''); // http://localhost:5000

/**
 * useChatSocket — manages the Socket.io connection for the chat system.
 *
 * The hook:
 *   1. Connects to Socket.io using the Chat JWT in the auth handshake
 *   2. Provides helper functions for all socket events
 *   3. Handles exponential back-off reconnection (1s → 2s → 4s, max 30s)
 *   4. Tears down cleanly on unmount
 *
 * @param {object} options
 *   chatJwt   (string|null)  — Chat JWT from POST /api/chat/token
 *   onToast   (function)     — callback to show connection error toasts
 *
 * @returns {{ sendDm, sendChannelMessage, joinChannel, leaveChannel,
 *             markRead, updateTyping, on, off, socket }}
 */
export function useChatSocket({ chatJwt, onToast } = {}) {
  const socketRef = useRef(null);
  const [socketVal, setSocketVal] = useState(null);

  useEffect(() => {
    if (!chatJwt) return;

    const socket = io(SOCKET_URL, {
      auth: { token: chatJwt },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      reconnectionAttempts: Infinity,
    });

    socketRef.current = socket;
    setSocketVal(socket);

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
      if (onToast) onToast(`Connection error: ${err.message}`);
    });

    socket.on('auth_error', ({ code }) => {
      console.error('[Socket] Auth error:', code);
      if (onToast) onToast('Chat authentication failed. Please refresh.');
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocketVal(null);
    };
  }, [chatJwt]); // reconnect if JWT changes

  // ── Event helpers ──────────────────────────────────────────────────────────

  const sendDm = useCallback((to, content, encryptedPayload = null) => {
    socketRef.current?.emit('dm:send', { to, content, encryptedPayload });
  }, []);

  const sendChannelMessage = useCallback((channelId, content) => {
    socketRef.current?.emit('channel:send', { channelId, content });
  }, []);

  const joinChannel = useCallback((channelId) => {
    socketRef.current?.emit('channel:join', { channelId });
  }, []);

  const leaveChannel = useCallback((channelId) => {
    socketRef.current?.emit('channel:leave', { channelId });
  }, []);

  const markRead = useCallback((messageId) => {
    socketRef.current?.emit('status:read', { messageId });
  }, []);

  const updateTyping = useCallback((conversationId, isTyping) => {
    const event = isTyping ? 'typing:start' : 'typing:stop';
    socketRef.current?.emit(event, { conversationId });
  }, []);

  const addReaction = useCallback((messageId, emoji) => {
    socketRef.current?.emit('reaction:add', { messageId, emoji });
  }, []);

  const removeReaction = useCallback((messageId, emoji) => {
    socketRef.current?.emit('reaction:remove', { messageId, emoji });
  }, []);

  const sendThreadReply = useCallback((parentMessageId, content, encryptedPayload = null) => {
    socketRef.current?.emit('thread:send', { parentMessageId, content, encryptedPayload });
  }, []);

  const pinMessage = useCallback((messageId) => {
    socketRef.current?.emit('message:pin', { messageId });
  }, []);

  const unpinMessage = useCallback((messageId) => {
    socketRef.current?.emit('message:unpin', { messageId });
  }, []);

  // Generic event subscription (for components to listen to any socket event)
  const on = useCallback((event, handler) => {
    socketRef.current?.on(event, handler);
    return () => socketRef.current?.off(event, handler);
  }, [socketVal]);

  const off = useCallback((event, handler) => {
    socketRef.current?.off(event, handler);
  }, []);

  return {
    sendDm,
    sendChannelMessage,
    joinChannel,
    leaveChannel,
    markRead,
    updateTyping,
    addReaction,
    removeReaction,
    sendThreadReply,
    pinMessage,
    unpinMessage,
    on,
    off,
    socket: socketRef,
    socketVal,
  };
}
