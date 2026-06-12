import { motion } from 'framer-motion';
import styles from './OrbitalNode.module.css';

/**
 * OrbitalNode — a floating circular conversation node on the Cosmic Canvas.
 *
 * Requirements 12.1–12.5:
 *   - Scales up when active (Zone Gravity)
 *   - Cyan glow when unread, magenta/purple glow when recently active
 *   - Unread badge
 *   - Click to expand into ExpandedChatView
 */
export default function OrbitalNode({
  zone,            // { id, name, type, avatars, unreadCount, isActive, lastMessage }
  position,        // { x, y } — canvas coordinates from CosmicCanvas physics
  scale = 1,
  onClick,
  isSelected,
}) {
  const hasUnread  = zone.unreadCount > 0;
  const isActive   = zone.isActive;

  const glowClass = hasUnread
    ? styles.glowUnread
    : isActive
    ? styles.glowActive
    : '';

  return (
    <motion.div
      className={`${styles.node} ${glowClass} ${isSelected ? styles.selected : ''}`}
      style={{
        left: position.x,
        top:  position.y,
        transform: `translate(-50%, -50%) scale(${scale})`,
      }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale }}
      whileHover={{ scale: scale * 1.08 }}
      onClick={() => onClick(zone)}
      title={zone.name}
      layout
    >
      {/* Avatar stack */}
      <div className={styles.avatarStack}>
        {zone.avatars?.slice(0, 3).map((avatar, i) => (
          <div
            key={i}
            className={styles.avatar}
            style={{ zIndex: 3 - i, marginLeft: i > 0 ? -10 : 0 }}
          >
            {avatar.photoURL
              ? <img src={avatar.photoURL} alt={avatar.name} />
              : <span>{avatar.name?.[0]?.toUpperCase() || '?'}</span>}
          </div>
        ))}
      </div>

      {/* Zone name */}
      <div className={styles.name}>{zone.name}</div>

      {/* Unread badge */}
      {hasUnread && (
        <div className={styles.badge}>
          {zone.unreadCount > 99 ? '99+' : zone.unreadCount}
        </div>
      )}

      {/* Glow ring */}
      <div className={`${styles.ring} ${glowClass}`} />
    </motion.div>
  );
}
