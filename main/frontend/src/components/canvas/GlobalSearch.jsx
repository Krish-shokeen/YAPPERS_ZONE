import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL } from '../../firebaseClient';
import styles from './GlobalSearch.module.css';

/**
 * GlobalSearch — dimmed full-screen overlay with a centralized search bar.
 *
 * Features:
 *   - 300ms debounce before hitting the API (prevents server overload)
 *   - Instant dropdown with avatar, name, handle, status, Add button
 *   - Keyboard navigation (Arrow keys + Enter + Escape)
 *   - Click a result to open ProfileModal
 */
export default function GlobalSearch({ chatJwt, currentUserId, onClose, onViewProfile }) {
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [selected, setSelected] = useState(-1);
  const [added,    setAdded]    = useState({}); // userId → 'pending'|'friends'
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  // Auto-focus on open
  useEffect(() => { inputRef.current?.focus(); }, []);

  // 300ms debounced search
  const search = useCallback((q) => {
    clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/users/search?q=${encodeURIComponent(q)}`,
          { headers: { Authorization: `Bearer ${chatJwt}` } }
        );
        const { users } = await res.json();
        setResults(users || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [chatJwt]);

  const handleInput = (e) => {
    setQuery(e.target.value);
    setSelected(-1);
    search(e.target.value);
  };

  // Keyboard navigation
  const handleKey = (e) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    }
    if (e.key === 'Enter' && selected >= 0 && results[selected]) {
      onViewProfile(results[selected].id);
      onClose();
    }
  };

  const sendRequest = async (e, userId) => {
    e.stopPropagation();
    setAdded((a) => ({ ...a, [userId]: 'pending' }));
    await fetch(`${API_BASE_URL}/users/${userId}/friend-request`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chatJwt}` },
    });
  };

  const STATUS_COLORS = {
    online: '#00e5ff', dnd: '#ff4d4d', idle: '#fbbf24', offline: '#6b7280',
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
        className={styles.searchBox}
        initial={{ scale: 0.92, opacity: 0, y: -20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: -20 }}
        transition={{ type: 'spring', damping: 24, stiffness: 340 }}
      >
        {/* Search input */}
        <div className={styles.inputWrap}>
          <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="#00e5ff" strokeWidth="1.5"/>
            <path d="M16 16 L21 21" stroke="#00e5ff" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            ref={inputRef}
            className={styles.input}
            value={query}
            onChange={handleInput}
            onKeyDown={handleKey}
            placeholder="Search by name or @handle… (e.g. krish#9999)"
          />
          {query && (
            <button className={styles.clearBtn} onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }}>
              ✕
            </button>
          )}
          <kbd className={styles.escKbd}>ESC</kbd>
        </div>

        {/* Results dropdown */}
        <AnimatePresence>
          {(results.length > 0 || loading) && (
            <motion.div
              className={styles.results}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              {loading && results.length === 0 && (
                <div className={styles.hint}>Searching…</div>
              )}
              {results.map((user, i) => (
                <div
                  key={user.id}
                  className={`${styles.result} ${i === selected ? styles.resultSelected : ''}`}
                  onClick={() => { onViewProfile(user.id); onClose(); }}
                >
                  {/* Avatar */}
                  <div className={styles.resultAvatar}>
                    {user.photoURL
                      ? <img src={user.photoURL} alt={user.displayName} />
                      : <span>{user.displayName?.[0]?.toUpperCase()}</span>}
                    <span
                      className={styles.resultStatusDot}
                      style={{
                        background: STATUS_COLORS[user.statusMode || 'offline'],
                        boxShadow: `0 0 5px ${STATUS_COLORS[user.statusMode || 'offline']}`,
                      }}
                    />
                  </div>

                  {/* Name + handle */}
                  <div className={styles.resultInfo}>
                    <span className={styles.resultName}>{user.displayName}</span>
                    <span className={styles.resultHandle}>{user.yapperHandle}</span>
                  </div>

                  {/* Status text */}
                  {user.statusText && (
                    <span className={styles.resultStatus}>{user.statusText}</span>
                  )}

                  {/* Add button */}
                  <button
                    className={`${styles.addBtn} ${(added[user.id] || user.isPending || user.isFriend) ? styles.addBtnDone : ''}`}
                    disabled={!!(added[user.id] || user.isPending || user.isFriend)}
                    onClick={(e) => sendRequest(e, user.id)}
                  >
                    {user.isFriend ? '✓'
                     : (added[user.id] === 'pending' || user.isPending) ? '⋯'
                     : '+'}
                  </button>
                </div>
              ))}

              {!loading && results.length === 0 && query.trim() && (
                <div className={styles.hint}>No users found for "{query}"</div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hint when empty */}
        {!query && results.length === 0 && (
          <div className={styles.emptyHint}>
            <div className={styles.emptyIcon}>🔍</div>
            <span>Type a name or Yapper ID to find someone</span>
            <span className={styles.emptySubHint}>e.g. krish#9999 or "Krish"</span>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
