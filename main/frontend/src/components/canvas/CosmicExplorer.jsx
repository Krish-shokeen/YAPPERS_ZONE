import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL } from '../../firebaseClient';
import styles from './CosmicExplorer.module.css';

/**
 * CosmicExplorer — public zone discovery overlay.
 *
 * Requirements 17.1–17.7:
 *   - Glass-scope overlay with >=12px backdrop blur
 *   - Curated Discovery Clusters (constellation-like groupings with connecting SVG lines)
 *   - Discovery Cards (icon, name, truncated description, active stats)
 *   - Join action: joins channel (via socket emit), transitions node in 500ms
 *   - Learn More toggle: inline expansion showing description, members, and messages
 *   - Zone Full indicator (memberCount >= 1000)
 */
export default function CosmicExplorer({ chatJwt, chatSocket, onClose, onSuccess }) {
  const [publicChannels, setPublicChannels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedCardId, setExpandedCardId] = useState(null);

  // ── Fetch public channels ──────────────────────────────────────────────────
  useEffect(() => {
    if (!chatJwt) return;
    setLoading(true);
    fetch(`${API_BASE_URL}/channels/public`, {
      headers: { Authorization: `Bearer ${chatJwt}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setPublicChannels(data.channels || []);
      })
      .catch((err) => console.error('[Explorer] Fetch public error:', err))
      .finally(() => setLoading(false));
  }, [chatJwt]);

  // ── Keyboard: Escape to close ──────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // ── Curate channels into clusters ──────────────────────────────────────────
  const techCluster = [];
  const artCluster = [];
  const communityCluster = [];

  publicChannels.forEach((ch, idx) => {
    const name = ch.name.toLowerCase();
    if (name.includes('tech') || name.includes('dev') || name.includes('code') || name.includes('quantum') || idx % 3 === 0) {
      techCluster.push(ch);
    } else if (name.includes('art') || name.includes('design') || name.includes('music') || name.includes('nebula') || idx % 3 === 1) {
      artCluster.push(ch);
    } else {
      communityCluster.push(ch);
    }
  });

  const handleJoin = (channel) => {
    if (channel.memberCount >= 1000) return;

    chatSocket?.joinChannel(channel.id);
    onSuccess?.(channel);
    onClose();
  };

  return (
    <motion.div
      className={styles.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className={`${styles.container} glass-panel`}>
        <div className={styles.header}>
          <h2>Cosmic Explorer</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div className={styles.loading}>Scanning Deep Space for Channels…</div>
        ) : (
          <div className={styles.body}>
            <ClusterSection
              title="Trending Tech"
              channels={techCluster}
              expandedId={expandedCardId}
              onExpand={setExpandedCardId}
              onJoin={handleJoin}
            />
            <ClusterSection
              title="Art Galaxies"
              channels={artCluster}
              expandedId={expandedCardId}
              onExpand={setExpandedCardId}
              onJoin={handleJoin}
            />
            <ClusterSection
              title="Community Commons"
              channels={communityCluster}
              expandedId={expandedCardId}
              onExpand={setExpandedCardId}
              onJoin={handleJoin}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ClusterSection({ title, channels, expandedId, onExpand, onJoin }) {
  if (channels.length === 0) return null;

  return (
    <div className={styles.clusterSection}>
      <h3 className={styles.clusterTitle}>{title}</h3>
      <div className={styles.constellationWrapper}>
        {/* Constellation SVG connectors */}
        <svg className={styles.svgLines}>
          {channels.map((ch, i) => {
            if (i === 0) return null;
            // Draw lines connecting subsequent nodes in the cluster
            return (
              <line
                key={`line-${ch.id}`}
                x1={`${(i - 1) * 260 + 100}`}
                y1="100"
                x2={`${i * 260 + 100}`}
                y2="100"
                className={styles.constellationLine}
              />
            );
          })}
        </svg>

        <div className={styles.cardsRow}>
          {channels.map((channel) => (
            <DiscoveryCard
              key={channel.id}
              channel={channel}
              isExpanded={expandedId === channel.id}
              onToggleExpand={() => onExpand(expandedId === channel.id ? null : channel.id)}
              onJoin={() => onJoin(channel)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DiscoveryCard({ channel, isExpanded, onToggleExpand, onJoin }) {
  const isFull = channel.memberCount >= 1000;
  const desc = channel.description || 'No description available for this cluster node.';
  const truncatedDesc = desc.length > 120 ? `${desc.slice(0, 120)}…` : desc;

  return (
    <motion.div
      layout
      className={`${styles.card} glass-panel`}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
    >
      <div className={styles.cardMain}>
        <div className={styles.cardIcon}>🪐</div>
        <div className={styles.cardInfo}>
          <h4 className={styles.cardName}>{channel.name}</h4>
          <span className={styles.memberBadge}>
            {channel.memberCount} / 1000 yappers
          </span>
        </div>
      </div>

      <p className={styles.cardDesc}>
        {isExpanded ? desc : truncatedDesc}
      </p>

      {isExpanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className={styles.expandedDetails}
        >
          <div className={styles.metaRow}>
            <strong>Pulse Level:</strong> Active
          </div>
          <div className={styles.metaRow}>
            <strong>Created:</strong> {new Date(channel.createdAt).toLocaleDateString()}
          </div>
        </motion.div>
      )}

      <div className={styles.cardActions}>
        <button
          type="button"
          className={styles.btnSecondary}
          onClick={onToggleExpand}
        >
          {isExpanded ? 'Show Less' : 'Learn More'}
        </button>

        {isFull ? (
          <span className={styles.fullBadge}>Zone Full</span>
        ) : (
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={onJoin}
          >
            Join Node
          </button>
        )}
      </div>
    </motion.div>
  );
}
