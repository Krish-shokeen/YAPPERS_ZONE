import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL } from '../../firebaseClient';
import styles from './ZoneIgnitionSystem.module.css';

/**
 * ZoneIgnitionSystem — Step-by-step zone creation wizard.
 *
 * Requirements 18.1–18.8, Property 42:
 *   - Three panels: Form, IgnitionOrb, Invites list
 *   - Configure -> Invite -> Launch progress flow
 *   - Monotonic step progress color transition cyan -> magenta
 *   - Reactive IgnitionOrb (size, color, pulse speed change)
 *   - Form name validation alphanumeric + hyphens (3–80 characters)
 *   - Launch creates channel (POST /api/channels), closes overlay, adds node
 */
export default function ZoneIgnitionSystem({ chatJwt, onClose, onSuccess }) {
  const [step, setStep] = useState(1); // 1: Configure, 2: Invite, 3: Launch
  const [name, setName] = useState('');
  const [type, setType] = useState('channel'); // channel | dm
  const [scale, setScale] = useState(1.0); // 0.5 - 2.0
  const [range, setRange] = useState(50); // 10 - 100
  const [gravity, setGravity] = useState(1.0); // 0.1 - 2.0
  const [friends, setFriends] = useState([]);
  const [invitedIds, setInvitedIds] = useState(new Set());
  const [nameError, setNameError] = useState('');
  const [completedSteps, setCompletedSteps] = useState(new Set());

  // Debounce validation ref
  const debounceRef = useRef(null);

  // ── Load friends from profile ──────────────────────────────────────────────
  useEffect(() => {
    if (!chatJwt) return;
    fetch(`${API_BASE_URL}/users/me/profile`, {
      headers: { Authorization: `Bearer ${chatJwt}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.user?.friends) {
          setFriends(data.user.friends);
        }
      })
      .catch((err) => console.error('[Ignition] Fetch friends error:', err));
  }, [chatJwt]);

  // ── Name validation on input change ────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!name) {
      setNameError('');
      return;
    }

    debounceRef.current = setTimeout(async () => {
      // Validate length
      if (name.length < 3 || name.length > 80) {
        setNameError('Name must be between 3 and 80 characters');
        return;
      }
      // Alphanumeric + hyphens
      if (!/^[a-zA-Z0-9-]+$/.test(name)) {
        setNameError('Only alphanumeric characters and hyphens allowed');
        return;
      }

      // Check if duplicate (case-insensitive)
      try {
        const res = await fetch(`${API_BASE_URL}/channels`, {
          headers: { Authorization: `Bearer ${chatJwt}` },
        });
        if (res.ok) {
          const { channels } = await res.json();
          const exists = channels?.some((ch) => ch.name.toLowerCase() === name.toLowerCase());
          if (exists) {
            setNameError('Zone name already taken');
          } else {
            setNameError('');
          }
        }
      } catch (err) {
        console.error(err);
      }
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [name, chatJwt]);

  // Toggle friend invite
  const handleToggleInvite = (id) => {
    setInvitedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Monotonic step completion
  const handleNextStep = () => {
    if (step === 1) {
      if (!name || nameError) return;
      setCompletedSteps((prev) => new Set([...prev, 1]));
      setStep(2);
    } else if (step === 2) {
      setCompletedSteps((prev) => new Set([...prev, 2]));
      setStep(3);
    }
  };

  const handleBackStep = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleLaunch = async () => {
    if (!name || nameError) return;
    try {
      setCompletedSteps((prev) => new Set([...prev, 3]));
      const res = await fetch(`${API_BASE_URL}/channels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${chatJwt}`,
        },
        body: JSON.stringify({
          name,
          description: `A custom cosmic zone. Scale: ${scale}, Range: ${range}, Gravity: ${gravity}`,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setNameError(err.message || 'Failed to create channel');
        return;
      }

      const data = await res.json();
      onSuccess?.(data.channel);
      onClose();
    } catch (err) {
      console.error(err);
      setNameError('An unexpected error occurred');
    }
  };

  // ── Compute IgnitionOrb styles based on state ──────────────────────────────
  const orbColor = type === 'channel' ? '#ff6ec7' : '#00e5ff';
  const pulseDuration = `${2.5 / gravity}s`;
  const orbSize = `${80 + scale * 40}px`;
  const glowRadius = `${range / 2}px`;

  return (
    <motion.div
      className={styles.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className={`${styles.container} glass-panel`}>
        <div className={styles.header}>
          <h2>Ignite New Zone</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {/* Panel 1: Left Form Panel */}
          <div className={`${styles.panel} ${styles.leftPanel}`}>
            <h3>Configuration</h3>
            <div className={styles.formGroup}>
              <label>Zone Name</label>
              <input
                type="text"
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. quantum-yap"
                disabled={step !== 1}
              />
              {nameError && <span className={styles.error}>{nameError}</span>}
            </div>

            <div className={styles.formGroup}>
              <label>Zone Type</label>
              <select
                className={styles.select}
                value={type}
                onChange={(e) => setType(e.target.value)}
                disabled={step !== 1}
              >
                <option value="channel">Galaxy Cluster (Group Channel)</option>
                <option value="dm">Orbital Node (Direct Message)</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Initial Scale ({scale.toFixed(1)}x)</label>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                className={styles.slider}
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value))}
                disabled={step !== 1}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Interaction Range ({range}m)</label>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                className={styles.slider}
                value={range}
                onChange={(e) => setRange(parseInt(e.target.value))}
                disabled={step !== 1}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Gravity Strength ({gravity.toFixed(1)}x)</label>
              <input
                type="range"
                min="0.1"
                max="2.0"
                step="0.1"
                className={styles.slider}
                value={gravity}
                onChange={(e) => setGravity(parseFloat(e.target.value))}
                disabled={step !== 1}
              />
            </div>
          </div>

          {/* Panel 2: Center IgnitionOrb Panel */}
          <div className={`${styles.panel} ${styles.centerPanel}`}>
            <div className={styles.orbWrapper}>
              <motion.div
                className={styles.orb}
                style={{
                  width: orbSize,
                  height: orbSize,
                  background: `radial-gradient(circle, ${orbColor} 0%, rgba(0,0,0,0.4) 75%)`,
                  boxShadow: `0 0 ${glowRadius} 10px ${orbColor}`,
                  animation: `${styles.pulse} ${pulseDuration} infinite ease-in-out`,
                }}
              />
              <div className={styles.orbReflection} />
            </div>
            <div className={styles.statusLabel}>
              {step === 1 ? 'Configure Core Physics' : step === 2 ? 'Establish Orbital Ties' : 'Ignition Sequence Ready'}
            </div>
          </div>

          {/* Panel 3: Right Contact Invite Panel */}
          <div className={`${styles.panel} ${styles.rightPanel}`}>
            <h3>Invite Contacts</h3>
            <div className={styles.friendList}>
              {friends.length === 0 ? (
                <div className={styles.noFriends}>No online friends found</div>
              ) : (
                friends.map((friend) => {
                  const isInvited = invitedIds.has(friend._id);
                  return (
                    <div key={friend._id} className={styles.friendItem}>
                      <div className={styles.friendInfo}>
                        <div className={styles.friendAvatar}>
                          {friend.displayName?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div className={styles.friendName}>{friend.displayName}</div>
                          <div className={styles.friendHandle}>{friend.yapperHandle}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`${styles.toggleBtn} ${isInvited ? styles.invited : ''}`}
                        onClick={() => handleToggleInvite(friend._id)}
                        disabled={step !== 2}
                      >
                        {isInvited ? 'Invited' : 'Invite'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer: Step Progress Bar & Actions */}
        <div className={styles.footer}>
          <div className={styles.stepProgress}>
            {['Configure', 'Invite', 'Launch'].map((stepLabel, idx) => {
              const currentStepIdx = idx + 1;
              const isCompleted = completedSteps.has(currentStepIdx);
              const isCurrent = step === currentStepIdx;
              return (
                <div key={stepLabel} className={styles.stepNodeWrapper}>
                  <div
                    className={`${styles.stepNode} ${isCompleted ? styles.completed : ''} ${isCurrent ? styles.current : ''}`}
                  />
                  <span className={styles.stepNodeLabel}>{stepLabel}</span>
                </div>
              );
            })}
          </div>

          <div className={styles.actions}>
            {step > 1 && (
              <button className={styles.btnSecondary} onClick={handleBackStep}>
                Back
              </button>
            )}
            {step < 3 ? (
              <button
                className={styles.btnPrimary}
                onClick={handleNextStep}
                disabled={step === 1 && (!name || nameError)}
              >
                Next
              </button>
            ) : (
              <button className={styles.btnLaunch} onClick={handleLaunch}>
                LAUNCH ZONE
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
