import { motion } from 'framer-motion';
import { API_BASE_URL } from '../../firebaseClient';
import styles from './FriendRequestsModal.module.css';

/**
 * FriendRequestsModal — popover overlay displaying incoming requests.
 * Uses frosted glass card overlay with framer-motion springs.
 */
export default function FriendRequestsModal({ friendRequests = [], chatJwt, onClose, onActionComplete }) {

  const handleAccept = async (requesterId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/users/${requesterId}/accept-friend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${chatJwt}` }
      });
      if (res.ok) {
        onActionComplete?.();
      }
    } catch (err) {
      console.error('Accept friend error:', err);
    }
  };

  const handleDecline = async (requesterId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/users/${requesterId}/decline-friend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${chatJwt}` }
      });
      if (res.ok) {
        onActionComplete?.();
      }
    } catch (err) {
      console.error('Decline friend error:', err);
    }
  };

  return (
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
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
        <h2 className={styles.title}>📩 Friend Requests</h2>

        <div className={styles.list}>
          {friendRequests.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>📡</span>
              <p className={styles.emptyText}>Your radar is quiet. No pending requests.</p>
            </div>
          ) : (
            friendRequests.map((req) => (
              <div key={req._id} className={styles.item}>
                <div className={styles.userInfo}>
                  <div className={styles.avatar}>
                    {req.photoURL ? (
                      <img src={req.photoURL} alt={req.displayName} />
                    ) : (
                      <span>{req.displayName?.[0]?.toUpperCase() || '?'}</span>
                    )}
                  </div>
                  <div className={styles.details}>
                    <span className={styles.name}>{req.displayName}</span>
                    <span className={styles.handle}>{req.yapperHandle}</span>
                  </div>
                </div>
                <div className={styles.actions}>
                  <button
                    className={`${styles.actionBtn} ${styles.acceptBtn}`}
                    onClick={() => handleAccept(req._id)}
                    title="Accept Request"
                  >
                    ✓
                  </button>
                  <button
                    className={`${styles.actionBtn} ${styles.declineBtn}`}
                    onClick={() => handleDecline(req._id)}
                    title="Decline Request"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
