import { useEffect, useRef, useState } from 'react';
import ReactionPicker from './ReactionPicker';
import styles from './MessageBubble.module.css';

/**
 * MessageBubble — renders a single chat message.
 *
 * Requirements 12.5, 7.9, 9.5:
 *   - Right-aligned accent bubble for sent messages
 *   - Left-aligned neutral bubble for received
 *   - Delivery ticks: ✓ sent, ✓✓ delivered, ✓✓ blue = read
 *   - Decryption error inline notice
 *   - Hover action bar to the SIDE of the bubble (not above)
 *   - Click bubble to toggle delivery timing tray
 *   - Reactions rendered below the bubble
 */
export default function MessageBubble({ message, currentUserId, chatSocket, onVisible, onReact, onReply }) {
  const ref = useRef(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const isSent = message.senderId?.toString() === currentUserId?.toString();

  // Requirement 7.4 — emit status:read when ≥50% of bubble is visible
  useEffect(() => {
    if (isSent || message.deliveryStatus === 'read') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= 0.5) {
          onVisible?.(message.messageId);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [message.messageId, message.deliveryStatus, isSent, onVisible]);

  // Delivery status ticks (Requirement 7.9)
  const Tick = () => {
    if (!isSent) return null;
    const { deliveryStatus } = message;
    if (deliveryStatus === 'read') {
      return <span className={`${styles.ticks} ${styles.read}`}>✓✓</span>;
    }
    if (deliveryStatus === 'delivered') {
      return <span className={styles.ticks}>✓✓</span>;
    }
    return <span className={`${styles.ticks} ${styles.sent}`}>✓</span>;
  };

  const handleReactSelect = (emoji) => {
    onReact?.(message.messageId, emoji);
    setShowPicker(false);
  };

  return (
    <div
      ref={ref}
      className={`${styles.wrapper} ${isSent ? styles.sent : styles.received}`}
    >
      {/* Sender avatar for received messages */}
      {!isSent && message.fromDisplayName && (
        <div className={styles.avatar}>
          {message.fromDisplayName[0]?.toUpperCase()}
        </div>
      )}

      {/*
        actionsContainer: flex row (received) or row-reverse (sent)
        Children: [actionBar] [bubbleColumn]
        For sent: row-reverse → [bubbleColumn] [actionBar]
      */}
      <div className={`${styles.actionsContainer} ${isSent ? styles.actionsSent : styles.actionsReceived}`}>

        {/* ── Side Action Bar ── */}
        <div className={styles.actionBar}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => setShowPicker((v) => !v)}
            title="Add reaction"
          >
            😊
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => onReply?.(message)}
            title="Reply in thread"
          >
            💬
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => {
              if (message.isPinned) {
                chatSocket?.unpinMessage(message.messageId);
              } else {
                chatSocket?.pinMessage(message.messageId);
              }
            }}
            title={message.isPinned ? 'Unpin message' : 'Pin message'}
          >
            {message.isPinned ? '📍' : '📌'}
          </button>

          {/* ── Reaction Picker — rendered inside actionBar so absolute pos is relative to it ── */}
          {showPicker && (
            <ReactionPicker
              onSelect={handleReactSelect}
              onClose={() => setShowPicker(false)}
            />
          )}
        </div>

        {/* ── Bubble + reactions stacked vertically ── */}
        <div className={styles.bubbleColumn}>
          {/* Pinned indicator */}
          {message.isPinned && (
            <div className={styles.pinnedIndicator}>
              📍 Pinned
            </div>
          )}

          <div
            className={`${styles.bubble} ${isSent ? styles.bubbleSent : styles.bubbleReceived}`}
            onClick={() => isSent && setShowDetails((v) => !v)}
            style={{ cursor: isSent ? 'pointer' : 'default' }}
          >
            {/* Sender name (channels) */}
            {!isSent && message.fromDisplayName && (
              <div className={styles.senderName}>{message.fromDisplayName}</div>
            )}

            {/* Decryption error */}
            {message.decryptionError ? (
              <div className={styles.decryptError}>⚠ Could not decrypt message</div>
            ) : (
              <>
                {message.content && <p className={styles.content}>{message.content}</p>}
              </>
            )}

            <div className={styles.footer}>
              <span className={styles.time}>
                {new Date(message.createdAt).toLocaleTimeString([], {
                  hour: '2-digit', minute: '2-digit',
                })}
              </span>
              <Tick />
            </div>

            {/* Detailed Timings on Click — only shown for SENT messages */}
            {isSent && showDetails && (
              <div className={styles.detailsTray} onClick={(e) => e.stopPropagation()}>
                {/* Sent time */}
                <div className={styles.detailLine}>
                  <span>Sent</span>
                  <span>{new Date(message.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                </div>

                {/* Delivered = other person's device received it (but may not have opened it) */}
                <div className={styles.detailLine}>
                  <span>Delivered</span>
                  <span>
                    {message.deliveredAt
                      ? new Date(message.deliveredAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                      : (message.deliveryStatus === 'delivered' || message.deliveryStatus === 'read')
                        ? 'Received'
                        : 'Pending'}
                  </span>
                </div>

                {/* Read = other person opened and saw the message */}
                <div className={styles.detailLine}>
                  <span>Read</span>
                  <span>
                    {message.readAt
                      ? new Date(message.readAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                      : message.deliveryStatus === 'read'
                        ? 'Seen'
                        : 'Not yet'}
                  </span>
                </div>
              </div>
            )}

            {/* Thread Reply Count */}
            {(message.replyCount > 0 || message.threadCount > 0) && (
              <button
                type="button"
                className={styles.threadCount}
                onClick={(e) => { e.stopPropagation(); onReply?.(message); }}
              >
                💬 {message.replyCount || message.threadCount} repl{(message.replyCount || message.threadCount) === 1 ? 'y' : 'ies'}
              </button>
            )}
          </div>

          {/* Reactions — below the bubble */}
          {message.reactions?.length > 0 && (
            <div className={styles.reactions}>
              {message.reactions.map((r) => {
                const userReacted = r.userIds?.some(id => id.toString() === currentUserId?.toString());
                return (
                  <button
                    key={r.emoji}
                    className={`${styles.reactionChip} ${userReacted ? styles.userReacted : ''}`}
                    onClick={() => onReact?.(message.messageId, r.emoji)}
                  >
                    {r.emoji} {r.userIds?.length || 0}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
