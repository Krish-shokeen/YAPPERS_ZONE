import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import MessageBubble from './MessageBubble';
import { API_BASE_URL } from '../../firebaseClient';
import styles from './ThreadPanel.module.css';

/**
 * ThreadPanel — slide-over panel for thread replies with cursor-based pagination.
 *
 * Requirements 14.4, 14.5, 14.6, 16.3:
 *   - Slide-over animation from right
 *   - Parent message shown at top
 *   - Paginated replies descending (scroll to top loads older replies)
 *   - Input box for sending replies via socket event thread:send
 *   - Listens for thread:message to update in real time
 */
export default function ThreadPanel({
  parentMessage,
  currentUserId,
  chatJwt,
  chatSocket,
  onClose,
}) {
  const [replies, setReplies] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef(null);
  const repliesEndRef = useRef(null);

  // ── Load initial replies history ───────────────────────────────────────────
  useEffect(() => {
    setReplies([]);
    loadReplies(null);

    if (chatSocket?.on) {
      const unsub = chatSocket.on('thread:message', (reply) => {
        if (reply.parentMessageId === parentMessage.messageId) {
          setReplies((prev) => [...prev, reply]);
          setTimeout(scrollToBottom, 50);
        }
      });
      return () => unsub?.();
    }
  }, [parentMessage.messageId, chatSocket?.on]);

  async function loadReplies(cursor) {
    if (!chatJwt) return;
    setLoading(true);
    try {
      const url = cursor
        ? `${API_BASE_URL}/channels/messages/${parentMessage.messageId}/replies?cursor=${cursor}`
        : `${API_BASE_URL}/channels/messages/${parentMessage.messageId}/replies`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${chatJwt}` },
      });
      if (!res.ok) return;
      const data = await res.json();

      // Replies are sorted from newest to oldest in MongoDB query.
      // So data.messages contains: [newest_reply, ..., oldest_reply].
      // For display, we want oldest first (chronological order).
      const fetched = [...data.messages].reverse();

      setReplies((prev) => cursor ? [...fetched, ...prev] : fetched);
      setHasMore(data.hasMore);

      if (!cursor) {
        setTimeout(scrollToBottom, 100);
      }
    } catch (err) {
      console.error('[ThreadPanel] loadReplies error:', err);
    } finally {
      setLoading(false);
    }
  }

  function scrollToBottom() {
    repliesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  // ── Scroll handler: Infinite scroll upward ────────────────────────────────
  function handleScroll(e) {
    const { scrollTop } = e.currentTarget;
    if (scrollTop < 40 && hasMore && !loading) {
      const oldest = replies[0]?.createdAt;
      if (oldest) {
        loadReplies(oldest);
      }
    }
  }

  // ── Send reply ─────────────────────────────────────────────────────────────
  function handleSend(e) {
    e.preventDefault();
    if (!inputText.trim()) return;

    chatSocket?.sendThreadReply(parentMessage.messageId, inputText.trim());
    setInputText('');
  }

  return (
    <motion.div
      className={`${styles.panel} glass-panel`}
      initial={{ x: 320, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 320, opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className={styles.header}>
        <div className={styles.headerTitle}>Thread</div>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      {/* Parent message focus */}
      <div className={styles.parentBox}>
        <div className={styles.parentLabel}>Original Message</div>
        <MessageBubble
          message={parentMessage}
          currentUserId={currentUserId}
          onVisible={null}
          onReact={null}
          onReply={null}
        />
      </div>

      <div className={styles.divider} />

      {/* Replies area */}
      <div className={styles.repliesArea} ref={scrollRef} onScroll={handleScroll}>
        {loading && <div className={styles.loading}>Loading replies…</div>}

        {replies.map((reply) => (
          <MessageBubble
            key={reply.messageId || reply._id}
            message={reply}
            currentUserId={currentUserId}
            onVisible={null}
            onReact={null}
            onReply={null}
          />
        ))}
        <div ref={repliesEndRef} />
      </div>

      {/* Input area */}
      <form className={styles.inputBar} onSubmit={handleSend}>
        <input
          type="text"
          className={styles.input}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Reply in thread…"
        />
        <button type="submit" className={styles.sendBtn} disabled={!inputText.trim()}>
          ➤
        </button>
      </form>
    </motion.div>
  );
}
