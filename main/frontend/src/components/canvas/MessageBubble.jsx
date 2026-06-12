import { useEffect, useRef } from 'react';
import styles from './MessageBubble.module.css';

/**
 * MessageBubble — renders a single chat message.
 *
 * Requirements 12.5, 7.9, 8.5, 9.5:
 *   - Right-aligned accent bubble for sent messages
 *   - Left-aligned neutral bubble for received
 *   - Delivery ticks: ✓ sent, ✓✓ delivered, ✓✓ blue = read
 *   - Media rendering: img / video / file download
 *   - Decryption error inline notice
 */
export default function MessageBubble({ message, currentUserId, onVisible, onReact }) {
  const ref = useRef(null);
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
  }, [message.messageId, message.deliveryStatus, isSent]);

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

      <div className={`${styles.bubble} ${isSent ? styles.bubbleSent : styles.bubbleReceived}`}>
        {/* Sender name (channels) */}
        {!isSent && message.fromDisplayName && (
          <div className={styles.senderName}>{message.fromDisplayName}</div>
        )}

        {/* Decryption error */}
        {message.decryptionError ? (
          <div className={styles.decryptError}>⚠ Could not decrypt message</div>
        ) : (
          <>
            {/* Plain text content */}
            {message.content && <p className={styles.content}>{message.content}</p>}

            {/* Media attachments (Requirement 8.5) */}
            {message.mediaAttachments?.map((media) => (
              <MediaPreview key={media.mediaId} media={media} />
            ))}
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

        {/* Reactions */}
        {message.reactions?.length > 0 && (
          <div className={styles.reactions}>
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                className={styles.reactionChip}
                onClick={() => onReact?.(message.messageId, r.emoji)}
              >
                {r.emoji} {r.userIds?.length || 0}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MediaPreview({ media }) {
  const { mimeType, signedUrl, name } = media;
  const isImage = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType);
  const isVideo = ['video/mp4', 'video/webm'].includes(mimeType);

  if (isImage) {
    return (
      <img
        src={signedUrl}
        alt={name}
        className={styles.mediaImg}
        onClick={() => window.open(signedUrl, '_blank')}
      />
    );
  }
  if (isVideo) {
    return <video src={signedUrl} controls className={styles.mediaVideo} />;
  }
  return (
    <a href={signedUrl} download={name} className={styles.mediaFile}>
      📎 {name}
    </a>
  );
}
