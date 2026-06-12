import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import styles from './Sidebar.module.css';

/**
 * Sidebar — minimalist translucent left panel.
 * Contains icons for Search, New Zone, Notifications, Settings, Profile.
 * Requirement 12.7
 */
export default function Sidebar({ onSearch, onNewZone }) {
  const { userProfile, logout } = useAuth();
  const navigate = useNavigate();

  const initial = userProfile?.displayName?.[0]?.toUpperCase() || '?';

  return (
    <aside className={styles.sidebar}>
      {/* Logo */}
      <div className={styles.logo} onClick={() => navigate('/chat')}>
        <span className={styles.logoIcon}>💬</span>
      </div>

      <div className={styles.divider} />

      {/* Search */}
      <button className={styles.iconBtn} title="Search" onClick={onSearch}>
        🔍
      </button>

      {/* New Zone */}
      <button className={styles.iconBtn} title="New Zone" onClick={onNewZone}>
        ➕
      </button>

      <div className={styles.spacer} />

      {/* Notifications */}
      <button className={styles.iconBtn} title="Notifications" onClick={() => navigate('/chat')}>
        🔔
      </button>

      {/* Settings */}
      <button className={styles.iconBtn} title="Settings" onClick={() => navigate('/chat/settings')}>
        ⚙️
      </button>

      {/* Profile avatar */}
      <button
        className={styles.avatar}
        title={userProfile?.displayName || 'Profile'}
        onClick={() => navigate('/chat/settings')}
      >
        {userProfile?.photoURL
          ? <img src={userProfile.photoURL} alt="avatar" />
          : initial}
        <span className={`${styles.statusDot} ${styles.online}`} />
      </button>
    </aside>
  );
}
