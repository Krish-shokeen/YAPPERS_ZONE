import { useRef, useCallback, useEffect, useState } from 'react';

const THROTTLE_MS = 2000;  // emit typing:start at most once every 2s
const STOP_DELAY  = 3000;  // emit typing:stop after 3s of no keystrokes

/**
 * useTyping — handles typing indicator emission and reception.
 *
 * Emission (Requirement 6.1):
 *   - Throttled: typing:start emitted at most once per 2 seconds
 *   - Auto-stop: typing:stop emitted after 3s of no keystrokes
 *   - Stop on send: call stopTyping() when message is sent
 *
 * Reception (Requirements 6.6–6.8):
 *   - Subscribes to typing:started / typing:stopped events
 *   - Exposes typingUsers array for the TypingIndicator component
 *
 * @param {object} options
 *   chatSocket      — useChatSocket return value
 *   conversationId  — current DM or channel ID
 *
 * @returns {{ onKeyPress, stopTyping, typingUsers }}
 */
export function useTyping({ chatSocket, conversationId }) {
  const lastEmitRef  = useRef(0);
  const stopTimerRef = useRef(null);
  const [typingUsers, setTypingUsers] = useState([]); // [{ userId, displayName }]

  // ── Emission ────────────────────────────────────────────────────────────────

  const onKeyPress = useCallback(() => {
    const now = Date.now();

    // Throttle: only emit if 2s have passed since last emit
    if (now - lastEmitRef.current >= THROTTLE_MS) {
      chatSocket?.updateTyping(conversationId, true);
      lastEmitRef.current = now;
    }

    // Reset the auto-stop timer
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(() => {
      chatSocket?.updateTyping(conversationId, false);
    }, STOP_DELAY);
  }, [chatSocket, conversationId]);

  const stopTyping = useCallback(() => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    chatSocket?.updateTyping(conversationId, false);
  }, [chatSocket, conversationId]);

  useEffect(() => {
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    };
  }, []);

  // ── Reception ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!chatSocket?.on || !conversationId) return;

    const unsubStart = chatSocket.on('typing:started', (data) => {
      if (data.conversationId !== conversationId) return;
      setTypingUsers((prev) => {
        if (prev.find((u) => u.userId === data.userId)) return prev;
        return [...prev, { userId: data.userId, displayName: data.displayName }];
      });
    });

    const unsubStop = chatSocket.on('typing:stopped', (data) => {
      if (data.conversationId !== conversationId) return;
      setTypingUsers((prev) => prev.filter((u) => u.userId !== data.userId));
    });

    return () => {
      unsubStart?.();
      unsubStop?.();
    };
  }, [chatSocket?.on, conversationId]);

  return { onKeyPress, stopTyping, typingUsers };
}
