import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import { useTyping } from '../../hooks/useTyping';
import { API_BASE_URL } from '../../firebaseClient';
import styles from './ExpandedChatView.module.css';

/**
 * ExpandedChatView — the focused zone chat window.
 *
 * Requirements 12.4–12.8, 7.4, 16.1–16.8:
 *   - Large rounded glass container with blurred backdrop
 *   - Teal/purple gradient message bubbles
 *   - Infinite scroll upward for history (cursor pagination)
 *   - Unread marker + Jump to Latest
 *   - Collapsible right context panel (Media, Pinned, Members)
 *   - Escape / click outside → close
 */
export default function ExpandedChatView({
  zone,
  currentUserId,
  chatJwt,
  chatSocket,
  onClose,
}) {
  const [messages, setMessages]         = useState([]);
  const [hasMore, setHasMore]           = useState(false);
  const [loadingMore, setLoadingMore]   = useState(false);
  const [inputText, setInputText]       = useState('');
  const [contextTab, setContextTab]     = useState('media'); // media | pinned | members
  const [contextOpen, setContextOpen]   = useState(true);
  const [unreadCount, setUnreadCount]   = useState(0);
  const [atBottom, setAtBottom]         = useState(true);
  const messagesEndRef = useRef(null);
  const scrollRef      = useRef(null);

  const { onKeyPress, stopTyping, typingUsers } = useTyping({
    chatSocket,
    conversationId: zone?.id,
  });

  // ── Load initial history ───────────────────────────────────────────────────
  useEffect(() => {
    if (!zone || !chatJwt) return;
    loadHistory(null);

    // Listen for new messages
    const unsub = chatSocket?.on(
      zone.type === 'dm' ? 'dm:receive' : 'channel:message',
      handleIncoming
    );
    return () => { unsub?.(); };
  }, [zone?.id]);

  async function loadHistory(cursor) {
    if (!chatJwt) return;
    setLoadingMore(true);
    try {
      const url = cursor
        ? `${API_BASE_URL}/channels/${zone.id}/messages?cursor=${cursor}`
        : `${API_BASE_URL}/channels/${zone.id}/messages`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${chatJwt}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setMessages((prev) => cursor ? [...data.messages, ...prev] : data.messages);
      setHasMore(data.hasMore);
    } catch (err) {
      console.error('[ExpandedChat] loadHistory error:', err);
    } finally {
      setLoadingMore(false);
    }
  }

  function handleIncoming(msg) {
    setMessages((prev) => [...prev, msg]);
    if (!atBottom) setUnreadCount((n) => n + 1);
    else scrollToBottom();
  }

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setUnreadCount(0);
  }

  // ── Send message ───────────────────────────────────────────────────────────
  function handleSend(e) {
    e.preventDefault();
    if (!inputText.trim()) return;
    stopTyping();
    if (zone.type === 'dm') {
      chatSocket?.sendDm(zone.recipientId, inputText.trim());
    } else {
      chatSocket?.sendChannelMessage(zone.id, inputText.trim());
    }
    setInputText('');
  }

  // ── Keyboard: Escape to close ──────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // ── Scroll tracking ────────────────────────────────────────────────────────
  function handleScroll(e) {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const nearBottom = scrollHeight - scrollTop - clientHeight < 80;
    setAtBottom(nearBottom);
    if (nearBottom) setUnreadCount(0);

    // Infinite scroll upward
    if (scrollTop < 60 && hasMore && !loadingMore) {
      const oldest = messages[0]?.createdAt;
      if (oldest) loadHistory(oldest);
    }
  }

  return (
    <motion.div
      className={styles.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <motion.div
        className={`${styles.container} glass-panel`}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className={styles.header}>
          <div className={styles.headerInfo}>
            <h2 className={styles.zoneName}>{zone?.name}</h2>
            <span className={styles.memberCount}>{zone?.memberCount} members</span>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.iconBtn} onClick={() => setContextOpen((o) => !o)} title="Toggle panel">
              ☰
            </button>
            <button className={styles.iconBtn} onClick={onClose} title="Close">✕</button>
          </div>
        </div>

        <div className={styles.body}>
          {/* ── Message list ──────────────────────────────────────────── */}
          <div className={styles.messageArea}>
            <div className={styles.messages} ref={scrollRef} onScroll={handleScroll}>
              {loadingMore && <div className={styles.loading}>Loading…</div>}

              {messages.map((msg) => (
                <MessageBubble
                  key={msg.messageId || msg._id}
                  message={msg}
                  currentUserId={currentUserId}
                  onVisible={(id) => chatSocket?.markRead(id)}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Unread / Jump to Latest */}
            <AnimatePresence>
              {!atBottom && unreadCount > 0 && (
                <motion.button
                  className={styles.jumpBtn}
                  onClick={scrollToBottom}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                >
                  ↓ {unreadCount} new message{unreadCount > 1 ? 's' : ''}
                </motion.button>
              )}
            </AnimatePresence>

            {/* Typing indicator */}
            <TypingIndicator typingUsers={typingUsers} />

            {/* Input bar */}
            <form className={styles.inputBar} onSubmit={handleSend}>
              <input
                className={styles.input}
                value={inputText}
                onChange={(e) => { setInputText(e.target.value); onKeyPress(); }}
                placeholder="Start Yapping…"
                autoFocus
              />
              <button type="submit" className={styles.sendBtn} disabled={!inputText.trim()}>
                ➤
              </button>
            </form>
          </div>

          {/* ── Context panel ─────────────────────────────────────────── */}
          <AnimatePresence>
            {contextOpen && (
              <motion.div
                className={`${styles.contextPanel} glass-panel`}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 260, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className={styles.contextTabs}>
                  {['media', 'pinned', 'members'].map((tab) => (
                    <button
                      key={tab}
                      className={`${styles.tab} ${contextTab === tab ? styles.activeTab : ''}`}
                      onClick={() => setContextTab(tab)}
                    >
                      {tab === 'media' ? '🖼' : tab === 'pinned' ? '📌' : '👥'}
                    </button>
                  ))}
                </div>
                <div className={styles.contextContent}>
                  {contextTab === 'media'   && <div className={styles.placeholder}>Shared media appears here</div>}
                  {contextTab === 'pinned'  && <div className={styles.placeholder}>Pinned messages appear here</div>}
                  {contextTab === 'members' && (
                    <div className={styles.memberList}>
                      {zone?.members?.map((m) => (
                        <div key={m.userId} className={styles.member}>
                          <div className={styles.memberAvatar}>{m.displayName?.[0]}</div>
                          <span className={styles.memberName}>{m.displayName}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
