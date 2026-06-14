import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import ThreadPanel from './ThreadPanel';
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
  getStatus,
  getLastSeen,
  onClose,
}) {
  const [messages, setMessages]         = useState([]);
  const [hasMore, setHasMore]           = useState(false);
  const [loadingMore, setLoadingMore]   = useState(false);
  const [inputText, setInputText]       = useState('');
  const [showPinnedModal, setShowPinnedModal] = useState(false);
  const [unreadCount, setUnreadCount]   = useState(0);
  const [atBottom, setAtBottom]         = useState(true);
  const [activeThreadParent, setActiveThreadParent] = useState(null);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [loadingPins, setLoadingPins]   = useState(false);
  const [initialLoad, setInitialLoad]   = useState(true);

  const messagesEndRef = useRef(null);
  const scrollRef      = useRef(null);

  const fetchPins = useCallback(async () => {
    if (!zone || !chatJwt) return;
    setLoadingPins(true);
    try {
      const res = await fetch(`${API_BASE_URL}/channels/${zone.id}/pins`, {
        headers: { Authorization: `Bearer ${chatJwt}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setPinnedMessages(data.pins || []);
    } catch (err) {
      console.error('[ExpandedChat] fetchPins error:', err);
    } finally {
      setLoadingPins(false);
    }
  }, [zone?.id, chatJwt]);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (initialLoad && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
      setInitialLoad(false);
    }
  }, [messages, initialLoad]);

  // Reset initialLoad flag when zone changes
  useEffect(() => {
    setInitialLoad(true);
  }, [zone?.id]);

  const { onKeyPress, stopTyping, typingUsers } = useTyping({
    chatSocket,
    conversationId: zone?.id,
  });

  // Fetch pins when modal opens
  useEffect(() => {
    if (showPinnedModal) {
      fetchPins();
    }
  }, [showPinnedModal, fetchPins]);


  useEffect(() => {
    if (!zone || !chatJwt) return;
    loadHistory(null);

    // Ensure client joins the channel room to receive real-time broadcasts
    if (zone.type === 'channel') {
      chatSocket?.joinChannel(zone.id);
    }

    // Listen for new messages
    const unsub = chatSocket?.on(
      zone.type === 'dm' ? 'dm:receive' : 'channel:message',
      handleIncoming
    );

    // Listen for reaction updates
    const unsubReaction = chatSocket?.on('reaction:update', ({ messageId, reactions }) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.messageId === messageId ? { ...msg, reactions } : msg))
      );
      setActiveThreadParent((parent) =>
        parent && parent.messageId === messageId ? { ...parent, reactions } : parent
      );
    });

    // Listen for thread replies
    const unsubThread = chatSocket?.on('thread:message', (reply) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.messageId === reply.parentMessageId
            ? { ...msg, replyCount: (msg.replyCount || 0) + 1 }
            : msg
        )
      );
      setActiveThreadParent((parent) =>
        parent && parent.messageId === reply.parentMessageId
          ? { ...parent, replyCount: (parent.replyCount || 0) + 1 }
          : parent
      );
    });

    // Listen for delivery status updates (read ticks)
    const unsubStatus = chatSocket?.on('status:update', ({ messageId, status }) => {
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.messageId !== messageId) return msg;
          const updates = { deliveryStatus: status };
          if (status === 'read' && !msg.readAt) updates.readAt = new Date().toISOString();
          if (status === 'delivered' && !msg.deliveredAt) updates.deliveredAt = new Date().toISOString();
          return { ...msg, ...updates };
        })
      );
    });

    // Listen for pin updates
    const unsubPin = chatSocket?.on('message:pin-update', ({ messageId, isPinned }) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.messageId === messageId ? { ...msg, isPinned } : msg))
      );
      if (isPinned) {
        fetchPins();
      } else {
        setPinnedMessages((prev) => prev.filter((m) => m.messageId !== messageId));
      }
    });

    return () => {
      unsub?.();
      unsubReaction?.();
      unsubThread?.();
      unsubStatus?.();
      unsubPin?.();
    };
  }, [zone?.id, chatSocket?.on, fetchPins]);

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

      // Messages are sorted from newest to oldest in the database query.
      // We reverse them to show older to newer from top to bottom.
      const fetched = [...data.messages].reverse();

      const container = scrollRef.current;
      const previousScrollHeight = container ? container.scrollHeight : 0;

      setMessages((prev) => cursor ? [...fetched, ...prev] : fetched);
      setHasMore(data.hasMore);

      if (cursor && container) {
        // Prevent scroll jump when prepending history
        requestAnimationFrame(() => {
          const newScrollHeight = container.scrollHeight;
          container.scrollTop = container.scrollTop + (newScrollHeight - previousScrollHeight);
        });
      }
    } catch (err) {
      console.error('[ExpandedChat] loadHistory error:', err);
    } finally {
      setLoadingMore(false);
    }
  }

  function handleIncoming(msg, ack) {
    if (typeof ack === 'function') ack();

    // Verify if this message belongs to the current conversation
    if (zone.type === 'dm') {
      const match =
        (msg.senderId?.toString() === zone.id?.toString() && msg.recipientId?.toString() === currentUserId?.toString()) ||
        (msg.senderId?.toString() === currentUserId?.toString() && msg.recipientId?.toString() === zone.id?.toString()) ||
        (msg.from?.toString() === zone.id?.toString() && msg.to?.toString() === currentUserId?.toString()) ||
        (msg.from?.toString() === currentUserId?.toString() && msg.to?.toString() === zone.id?.toString());
      if (!match) return;
    } else {
      if (msg.channelId !== zone.id) return;
    }

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
            {zone?.type === 'dm' ? (
              <span className={styles.memberCount}>
                {(() => {
                  const status = getStatus ? getStatus(zone.recipientId) : 'offline';
                  const lastSeen = getLastSeen ? getLastSeen(zone.recipientId) : null;
                  const label = status === 'online' ? 'Online' : status === 'dnd' ? 'Do Not Disturb' : status === 'idle' ? 'Idle' : 'Offline';
                  if (status === 'offline' && lastSeen) {
                    const d = new Date(lastSeen);
                    return `Offline · Last seen ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
                  }
                  return label;
                })()}
              </span>
            ) : (
              <span className={styles.memberCount}>{zone?.memberCount} members</span>
            )}
          </div>
          <div className={styles.headerActions}>
            {/* Pinned messages button */}
            <button
              className={`${styles.iconBtn} ${showPinnedModal ? styles.iconBtnActive : ''}`}
              onClick={() => setShowPinnedModal((v) => !v)}
              title="Pinned messages"
            >
              📌
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
                  chatSocket={chatSocket}
                  onVisible={(id) => chatSocket?.markRead(id)}
                  onReact={(msgId, emoji) => {
                    const msgObj = messages.find((m) => m.messageId === msgId);
                    const rx = msgObj?.reactions?.find((r) => r.emoji === emoji);
                    const alreadyReacted = rx?.userIds?.some(
                      (id) => id.toString() === currentUserId?.toString()
                    );
                    if (alreadyReacted) {
                      chatSocket?.removeReaction(msgId, emoji);
                    } else {
                      chatSocket?.addReaction(msgId, emoji);
                    }
                  }}
                  onReply={(msg) => setActiveThreadParent(msg)}
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

          {/* ── Pinned Messages Modal ──────────────────────────────── */}
          <AnimatePresence>
            {showPinnedModal && (
              <motion.div
                className={styles.pinnedModal}
                initial={{ opacity: 0, y: -10, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.97 }}
                transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              >
                <div className={styles.pinnedModalHeader}>
                  <span>📌 Pinned Messages</span>
                  <button
                    className={styles.iconBtn}
                    onClick={() => setShowPinnedModal(false)}
                  >✕</button>
                </div>
                <div className={styles.pinnedModalBody}>
                  {loadingPins ? (
                    <div className={styles.placeholder}>Loading…</div>
                  ) : pinnedMessages.length === 0 ? (
                    <div className={styles.placeholder}>No pinned messages yet.<br/>Hover a message and click 📌 to pin it.</div>
                  ) : (
                    pinnedMessages.map((msg) => (
                      <div key={msg.messageId} className={styles.pinnedItem}>
                        <div className={styles.pinnedHeader}>
                          <span className={styles.pinnedSender}>
                            {msg.fromDisplayName || msg.senderDisplayName || 'User'}
                          </span>
                          <span className={styles.pinnedTime}>
                            {new Date(msg.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className={styles.pinnedContent}>{msg.content}</p>
                        <button
                          type="button"
                          className={styles.unpinBtn}
                          onClick={() => {
                            chatSocket?.unpinMessage(msg.messageId);
                            setPinnedMessages((prev) => prev.filter((m) => m.messageId !== msg.messageId));
                          }}
                        >
                          Unpin
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Thread Panel ───────────────────────────────────────────── */}
          <AnimatePresence>
            {activeThreadParent && (
              <ThreadPanel
                parentMessage={activeThreadParent}
                currentUserId={currentUserId}
                chatJwt={chatJwt}
                chatSocket={chatSocket}
                onClose={() => setActiveThreadParent(null)}
              />
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
