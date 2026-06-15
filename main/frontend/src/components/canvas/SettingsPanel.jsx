import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../AuthContext';
import { API_BASE_URL } from '../../firebaseClient';
import { PRESET_AVATARS } from '../../utils/avatars.js';
import styles from './SettingsPanel.module.css';

const THEMES = [
  { id: 'nebula-blue',  label: 'Nebula Blue',  colors: ['#00e5ff', '#7b2fff', '#0a0e1a'] },
  { id: 'supernova',    label: 'Supernova',     colors: ['#ffaa00', '#ff6600', '#1a0a00'] },
  { id: 'deep-violet',  label: 'Deep Violet',   colors: ['#bf5fff', '#ff6ec7', '#0d0a1a'] },
];

const STATUS_OPTIONS = [
  { id: 'online',  label: 'Online',          color: '#00e5ff' },
  { id: 'idle',    label: 'Idle',             color: '#fbbf24' },
  { id: 'dnd',     label: 'Do Not Disturb',  color: '#ff4d4d' },
  { id: 'offline', label: 'Appear Offline',  color: '#6b7280' },
];

export default function SettingsPanel({ chatJwt, onClose }) {
  const { user, userProfile, logout, updateProfile } = useAuth();
  const [tab, setTab]       = useState('profile'); // profile | appearance | notifications | security
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState('');

  // Account deletion states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Profile fields
  const [displayName, setDisplayName] = useState(userProfile?.displayName || user?.displayName || '');
  const [statusText,  setStatusText]  = useState('');
  const [statusMode,  setStatusMode]  = useState('online');
  const [photoURL, setPhotoURL] = useState(userProfile?.photoURL || user?.photoURL || PRESET_AVATARS[0].url);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef(null);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image size should be less than 5MB.');
      return;
    }

    setUploadingImage(true);
    setError('');

    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoURL(reader.result);
        setUploadingImage(false);
      };
      reader.onerror = () => {
        setUploadingImage(false);
        setError('Failed to upload image. Please try again.');
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setUploadingImage(false);
      setError('Failed to upload image. Please try again.');
    }
  };

  // Appearance
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'nebula-blue');

  const applyTheme = (id) => {
    setTheme(id);
    document.documentElement.setAttribute('data-theme', id);
  };

  const saveProfile = async () => {
    setSaving(true);
    setError('');
    try {
      // Update display name and photoURL via context updateProfile function
      await updateProfile({ displayName, photoURL });

      // Update status via chat route
      if (chatJwt) {
        await fetch(`${API_BASE_URL}/users/me/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chatJwt}` },
          body: JSON.stringify({ statusText, statusMode }),
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/users/me`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${chatJwt}` }
      });
      if (!res.ok) {
        throw new Error('Failed to delete account');
      }
      await logout();
      onClose();
    } catch (err) {
      setError('Failed to delete account. Please try again.');
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const initial = (displayName || user?.email || '?')[0].toUpperCase();
  const handle   = userProfile?.yapperHandle || '';

  const TABS = [
    { id: 'profile',      label: 'Profile',    icon: '👤' },
    { id: 'appearance',   label: 'Appearance', icon: '🎨' },
    { id: 'notifications',label: 'Alerts',     icon: '🔔' },
    { id: 'security',     label: 'Security',   icon: '🔒' },
  ];

  return (
    <motion.div
      className={styles.backdrop}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        className={styles.panel}
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: 'spring', damping: 24, stiffness: 300 }}
      >
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.headerTitle}>Settings</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {/* Tab list */}
          <div className={styles.tabs}>
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`${styles.tabBtn} ${tab === t.id ? styles.tabActive : ''}`}
                onClick={() => setTab(t.id)}
              >
                <span className={styles.tabIcon}>{t.icon}</span>
                {t.label}
              </button>
            ))}
            <div className={styles.tabSpacer} />
            <button className={styles.logoutBtn} onClick={logout}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Log Out
            </button>
          </div>

          {/* Tab content */}
          <div className={styles.content}>
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.15 }}
                className={styles.tabContent}
              >

                {/* ── Profile tab ─────────────────────────────────────────── */}
                {tab === 'profile' && (
                  <div className={styles.section}>
                    {/* Profile card preview */}
                    <div className={styles.profilePreview}>
                      <div className={styles.previewBanner} />
                      <div className={styles.previewAvatar}>
                        {photoURL
                          ? <img src={photoURL} alt={displayName} />
                          : <span>{initial}</span>}
                        <div
                          className={styles.previewStatusDot}
                          style={{ background: STATUS_OPTIONS.find(s => s.id === statusMode)?.color || '#00e5ff' }}
                        />
                      </div>
                      <div className={styles.previewInfo}>
                        <span className={styles.previewName}>{displayName || 'Your Name'}</span>
                        {handle && <span className={styles.previewHandle}>{handle}</span>}
                        {statusText && <span className={styles.previewStatus}>{statusText}</span>}
                      </div>
                    </div>

                    {/* Avatar Selection */}
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Cosmic Avatar Presets</label>
                      <div className={styles.avatarPickerGrid}>
                        {PRESET_AVATARS.map((av) => (
                          <button
                            key={av.id}
                            type="button"
                            className={`${styles.avatarPickerBtn} ${photoURL === av.url ? styles.avatarPickerBtnActive : ''}`}
                            onClick={() => setPhotoURL(av.url)}
                            title={av.name}
                          >
                            <img src={av.url} alt={av.name} className={styles.avatarPickerImg} />
                          </button>
                        ))}
                      </div>
                      
                      {/* Custom Upload */}
                      <div className={styles.customUploadRow}>
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleImageUpload}
                          accept="image/*"
                          style={{ display: 'none' }}
                        />
                        <button
                          type="button"
                          className={styles.uploadBtn}
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingImage}
                        >
                          {uploadingImage ? '📤 Uploading...' : '📷 Upload Custom Photo'}
                        </button>
                        <span className={styles.uploadHint}>Max 5MB (JPG, PNG, WebP)</span>
                      </div>
                    </div>

                    {/* Form */}
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Display Name</label>
                      <input
                        className={styles.input}
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Your name"
                        maxLength={32}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.label}>Status Text</label>
                      <input
                        className={styles.input}
                        value={statusText}
                        onChange={(e) => setStatusText(e.target.value)}
                        placeholder="In the coding zone…"
                        maxLength={128}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.label}>Status</label>
                      <div className={styles.statusGrid}>
                        {STATUS_OPTIONS.map((s) => (
                          <button
                            key={s.id}
                            className={`${styles.statusOpt} ${statusMode === s.id ? styles.statusOptActive : ''}`}
                            style={{ '--sc': s.color }}
                            onClick={() => setStatusMode(s.id)}
                          >
                            <span className={styles.statusOptDot} style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {error && <div className={styles.error}>{error}</div>}

                    <button className={styles.saveBtn} onClick={saveProfile} disabled={saving}>
                      {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
                    </button>

                    {handle && (
                      <div className={styles.handleNote}>
                        Your Yapper ID: <span className={styles.handleCode}>{handle}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Appearance tab ──────────────────────────────────────── */}
                {tab === 'appearance' && (
                  <div className={styles.section}>
                    <div className={styles.sectionTitle}>Nebula Theme</div>
                    <div className={styles.themeGrid}>
                      {THEMES.map((t) => (
                        <button
                          key={t.id}
                          className={`${styles.themeCard} ${theme === t.id ? styles.themeCardActive : ''}`}
                          onClick={() => applyTheme(t.id)}
                        >
                          <div className={styles.themePreview}>
                            <div className={styles.themePreviewBg} style={{ background: `linear-gradient(135deg, ${t.colors[2]}, ${t.colors[2]})` }} />
                            <div className={styles.themePreviewOrb1} style={{ background: t.colors[0] }} />
                            <div className={styles.themePreviewOrb2} style={{ background: t.colors[1] }} />
                          </div>
                          <div className={styles.themeLabel}>{t.label}</div>
                          {theme === t.id && <div className={styles.themeCheck}>✓</div>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Notifications tab ───────────────────────────────────── */}
                {tab === 'notifications' && (
                  <div className={styles.section}>
                    <div className={styles.sectionTitle}>Notification Preferences</div>
                    {[
                      { label: 'Zone Alerts',     sub: 'Messages in your zones' },
                      { label: 'Direct Messages', sub: 'Personal DM notifications' },
                      { label: 'Mentions',        sub: 'When someone @mentions you' },
                      { label: 'Friend Requests', sub: 'New connection requests' },
                    ].map((item) => (
                      <NotifToggle key={item.label} label={item.label} sub={item.sub} />
                    ))}
                  </div>
                )}

                {/* ── Security tab ─────────────────────────────────────────── */}
                {tab === 'security' && (
                  <div className={styles.section}>
                    <div className={styles.sectionTitle}>Account Security</div>
                    <div className={styles.securityCard}>
                      <div className={styles.securityCardIcon}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <path d="M12 2L4 6v6c0 5 4 9 8 10 4-1 8-5 8-10V6l-8-4z" stroke="#00e5ff" strokeWidth="1.5" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div>
                        <div className={styles.securityCardTitle}>Firebase Authentication</div>
                        <div className={styles.securityCardSub}>Your account is secured via Firebase. Password changes are managed through your email provider.</div>
                      </div>
                    </div>
                    <div className={styles.securityCard}>
                      <div className={styles.securityCardIcon}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <rect x="2" y="11" width="20" height="11" rx="2" stroke="#7b2fff" strokeWidth="1.5"/>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#7b2fff" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div>
                        <div className={styles.securityCardTitle}>E2E Encryption</div>
                        <div className={styles.securityCardSub}>Your DM encryption keys are stored locally on this device only. They are never sent to the server.</div>
                      </div>
                    </div>
                    <div className={styles.securityCard}>
                      <div className={styles.securityCardIcon}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="#ff6ec7" strokeWidth="1.5"/>
                          <path d="M12 8v4M12 16h.01" stroke="#ff6ec7" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div>
                        <div className={styles.securityCardTitle}>Signed in as</div>
                        <div className={styles.securityCardSub}>{user?.email}</div>
                      </div>
                    </div>

                    {/* Danger Zone */}
                    <div className={styles.dangerZone}>
                      <div className={styles.dangerTitle}>Danger Zone</div>
                      <div className={styles.dangerCard}>
                        <div className={styles.dangerCardInfo}>
                          <div className={styles.dangerCardTitle}>Delete Account</div>
                          <div className={styles.dangerCardSub}>Permanently delete your account and all associated data. This action is irreversible.</div>
                        </div>
                        <button className={styles.deleteAccountBtn} onClick={() => setShowDeleteConfirm(true)}>
                          Delete Account
                        </button>
                      </div>
                    </div>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* Delete Account Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            className={styles.confirmBackdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className={styles.confirmCard}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            >
              <h3 className={styles.confirmTitle}>Delete Account</h3>
              <p className={styles.confirmText}>
                Are you absolutely sure you want to permanently delete your account? This action is <strong>irreversible</strong> and will delete all your settings and profile data.
              </p>
              <p className={styles.confirmInputLabel}>
                Please type <strong>DELETE</strong> to confirm:
              </p>
              <input
                type="text"
                className={styles.confirmInput}
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                placeholder="DELETE"
                autoFocus
              />
              <div className={styles.confirmActions}>
                <button
                  className={styles.confirmCancelBtn}
                  onClick={() => { setShowDeleteConfirm(false); setDeleteInput(''); }}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  className={styles.confirmDeleteBtn}
                  onClick={handleDeleteAccount}
                  disabled={deleting || deleteInput !== 'DELETE'}
                >
                  {deleting ? 'Deleting...' : 'Delete Permanently'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function NotifToggle({ label, sub }) {
  const [on, setOn] = useState(true);
  return (
    <div className={styles.notifRow}>
      <div>
        <div className={styles.notifLabel}>{label}</div>
        <div className={styles.notifSub}>{sub}</div>
      </div>
      <button
        className={`${styles.toggle} ${on ? styles.toggleOn : ''}`}
        onClick={() => setOn((v) => !v)}
      >
        <div className={styles.toggleKnob} />
      </button>
    </div>
  );
}
