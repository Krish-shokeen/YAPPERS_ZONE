import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL } from '../../firebaseClient';
import styles from './ProfileModal.module.css';

/**
 * ProfileModal — Discord-style identity card popup.
 *
 * Shows:
 *   - Avatar with live status glow (cyan=online, red=dnd, moon=idle, grey=offline)
 *   - Yapper ID (copyable handle like krish#9999)
 *   - Custom status text
 *   - Shared zone badges
 *   - Add Friend / Message action buttons
 */
export default function ProfileModal({ userId, currentUserId, chatJwt, onClose, onMessage }) {
  const [user,      setUser]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [copied,    setCopied]    = useState(false);
  const [reqState,  setReqState]  = useState('idle'); // idle | pending | friends

  useEffect(() => {
    if (!userId || !chatJwt) return;
    setLoading(true);
    fetch(`${API_BASE_URL}/users/${userId}`, {
      headers: { Authorization: `Bearer ${chatJwt}` },
    })
      .then((r) => r.json())
      .then(({ user: u }) => {
        setUser(u);
        if (u?.isFriend)  setReqState('friends');
        if (u?.isPending) setReqState('pending');
      })
      .finally(() => setLoading(false));
  }, [userId, chatJwt]);

  const copyHandle = () => {
    navigator.clipboard.writeText(user?.yapperHandle || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendFriendRequest = async () => {
    if (reqState !== 'idle') return;
    setReqState('pending');
    await fetch(`${API_BASE_URL}/users/${userId}/friend-request`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chatJwt}` },
    });
  };

  const STATUS_CONFIG = {
    online:  { color: '#00e5ff', label: 'Online',     icon: '●' },
    dnd:     { color: '#ff4d4d', label: 'Do Not Disturb', icon: '⊘' },
    idle:    { color: '#fbbf24', label: 'Idle',        icon: '☽' },
    offline: { color: '#6b7280', label: 'Offline',     icon: '●' },
  };

  const statusCfg = STATUS_CONFIG[user?.statusMode || 'offline'];

  return (
    <AnimatePresence>
      <motion.div
        className={styles.backdrop}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          className={styles.card}
          initial={{ scale: 0.85, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.85, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 22, stiffness: 320 }}
        >
          {/* Close */}
          <button className={styles.closeBtn} onClick={onClose}>✕</button>

          {loading ? (
            <div className={styles.loading}>
              <div className={styles.loadingDot} />
              <div className={styles.loadingDot} />
              <div className={styles.loadingDot} />
            </div>
          ) : user ? (
            <>
              {/* Banner gradient */}
              <div className={styles.banner} style={{ '--sc': statusCfg.color }} />

              {/* Avatar + status */}
              <div className={styles.avatarWrap}>
                <div className={styles.avatar} style={{ '--sc': statusCfg.color }}>
                  {user.photoURL
                    ? <img src={user.photoURL} alt={user.displayName} />
                    : <span>{user.displayName?.[0]?.toUpperCase() || '?'}</span>}
                  <div className={styles.statusDot} style={{ background: statusCfg.color, boxShadow: `0 0 8px ${statusCfg.color}` }} />
                </div>
              </div>

              {/* Identity */}
              <div className={styles.identity}>
                <h2 className={styles.displayName}>{user.displayName}</h2>

                {/* Yapper ID — copyable */}
                <button className={styles.yapperHandle} onClick={copyHandle} title="Copy Yapper ID">
                  <span>{user.yapperHandle || '@' + user.displayName?.toLowerCase()}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    {copied
                      ? <path d="M5 13l4 4L19 7" stroke="#00e5ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      : <>
                          <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="1.5"/>
                        </>
                    }
                  </svg>
                  {copied && <span className={styles.copiedToast}>Copied!</span>}
                </button>

                {/* Status */}
                <div className={styles.statusRow}>
                  <span style={{ color: statusCfg.color, fontSize: 10 }}>{statusCfg.icon}</span>
                  <span className={styles.statusLabel}>{statusCfg.label}</span>
                  {user.statusText && (
                    <span className={styles.statusText}>— {user.statusText}</span>
                  )}
                  {user.statusMode === 'offline' && user.lastSeenAt && (
                    <span className={styles.statusText} style={{ opacity: 0.65, fontSize: '11px', marginLeft: '6px' }}>
                      (Last seen {new Date(user.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {new Date(user.lastSeenAt).toLocaleDateString([], { month: 'short', day: 'numeric' })})
                    </span>
                  )}
                </div>
              </div>

              {/* Zone badges — shared zones */}
              {user.sharedZones?.length > 0 && (
                <div className={styles.zonesSection}>
                  <div className={styles.zonesSectionTitle}>Shared Zones</div>
                  <div className={styles.zonesBadges}>
                    {user.sharedZones.map((z) => (
                      <div key={z.id} className={styles.zoneBadge} title={z.name}>
                        <div className={styles.zoneBadgeIcon} />
                        <span>{z.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Member since */}
              <div className={styles.memberSince}>
                Member since {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </div>

              {/* Action buttons */}
              {userId !== currentUserId && (
                <div className={styles.actions}>
                  <button
                    className={`${styles.btnAdd} ${reqState !== 'idle' ? styles.btnAddDone : ''}`}
                    onClick={sendFriendRequest}
                    disabled={reqState !== 'idle'}
                  >
                    {reqState === 'friends' ? '✓ Friends'
                     : reqState === 'pending' ? '⋯ Pending'
                     : '+ Add Friend'}
                  </button>
                  <button
                    className={styles.btnMessage}
                    onClick={() => { onMessage?.(user); onClose(); }}
                  >
                    Message
                  </button>
                </div>
              )}

              {/* Own profile — show edit hint */}
              {userId === currentUserId && (
                <div className={styles.ownProfileNote}>Your profile · Edit in Settings</div>
              )}
            </>
          ) : (
            <div className={styles.error}>User not found</div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
