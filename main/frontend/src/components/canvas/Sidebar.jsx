import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import styles from './Sidebar.module.css';

/**
 * Sidebar — minimalist translucent left panel.
 * Contains icons for Search, New Zone, Notifications, Settings, Profile.
 * Requirement 12.7
 */
export default function Sidebar({ onSearch, onNewZone, onExplorer, onSettings, onProfile, hasNotifications, onNotifications }) {
  const { userProfile, logout } = useAuth();
  const navigate = useNavigate();

  const initial = userProfile?.displayName?.[0]?.toUpperCase() || '?';

  return (
    <aside className={styles.sidebar}>
      {/* Logo */}
      <div className={styles.logo} onClick={() => navigate('/chat')}>
        <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
          <defs>
            <linearGradient id="sbLogoGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#00e5ff"/>
              <stop offset="100%" stopColor="#7b2fff"/>
            </linearGradient>
          </defs>
          <rect width="32" height="32" rx="10" fill="url(#sbLogoGrad)" opacity="0.15"/>
          <rect width="32" height="32" rx="10" stroke="url(#sbLogoGrad)" strokeWidth="1.5" fill="none"/>
          <path d="M8 10 Q8 8 10 8 L22 8 Q24 8 24 10 L24 18 Q24 20 22 20 L14 20 L11 23 L11 20 L10 20 Q8 20 8 18 Z" fill="url(#sbLogoGrad)" opacity="0.9"/>
          <circle cx="13" cy="14" r="1.2" fill="white"/>
          <circle cx="16" cy="14" r="1.2" fill="white"/>
          <circle cx="19" cy="14" r="1.2" fill="white"/>
        </svg>
      </div>

      <div className={styles.divider} />

      {/* Search */}
      <button className={styles.iconBtn} title="Search people" onClick={onSearch}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M16 16 L21 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>

      {/* New Zone */}
      <button className={styles.iconBtn} title="Create a Zone" onClick={onNewZone}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>

      {/* Discover Zones */}
      <button className={styles.iconBtn} title="Discover Zones" onClick={onExplorer}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
          <polygon points="12,6 15,12 12,18 9,12" fill="none" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      </button>

      <div className={styles.spacer} />

      {/* Notifications */}
      <button className={styles.iconBtn} title="Notifications" onClick={onNotifications} style={{ position: 'relative' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        {hasNotifications && (
          <span className={styles.notificationDot} />
        )}
      </button>

      {/* Settings */}
      <button className={styles.iconBtn} title="Settings" onClick={onSettings}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5.6 5.6l1.4 1.4M16.9 16.9l1.5 1.5M5.6 18.4l1.4-1.4M16.9 7.1l1.5-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>

      {/* Profile avatar */}
      <button
        className={styles.avatar}
        title="My Profile"
        onClick={onProfile}
      >
        {userProfile?.photoURL
          ? <img src={userProfile.photoURL} alt="avatar" />
          : initial}
        <span className={`${styles.statusDot} ${styles[userProfile?.statusMode || 'online']}`} />
      </button>
    </aside>
  );
}
