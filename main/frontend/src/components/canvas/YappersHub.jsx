import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import OrbitalNode from './OrbitalNode';
import Sidebar from './Sidebar';
import ExpandedChatView from './ExpandedChatView';
import GlobalSearch from './GlobalSearch';
import ProfileModal from './ProfileModal';
import SettingsPanel from './SettingsPanel';
import ZonalNavigationBar from './ZonalNavigationBar';
import CometInput from './CometInput';
import ZoneIgnitionSystem from './ZoneIgnitionSystem';
import CosmicExplorer from './CosmicExplorer';
import GalaxyCluster from './GalaxyCluster';
import FriendRequestsModal from './FriendRequestsModal';
import { usePresence } from '../../hooks/usePresence';
import { API_BASE_URL } from '../../firebaseClient';
import styles from './YappersHub.module.css';

/**
 * YappersHub — the main Cosmic Canvas view.
 *
 * Requirements 12.1–12.8, 15.1–15.6, 16.1–16.8:
 *   - Renders GalaxyClusters for channels, peripheral OrbitalNodes for DMs
 *   - Zone Gravity physics loop: active nodes to center, 30s inactive to periphery
 *   - Search input filters by name, filter tags Active/Muted/Friends
 *   - Single-click node -> CometInput docks 72px below node
 *   - Double-click node -> ExpandedChatView (spring layout transitions)
 *   - Side-over ThreadPanel for replies
 */
export default function YappersHub({ chatJwt, chatSocket, currentUserId }) {
  const [zones, setZones]               = useState([]);
  const [activeNode, setActiveNode]     = useState(null);
  const [expandedZone, setExpandedZone] = useState(null);
  const [positions, setPositions]       = useState({});
  const [scales, setScales]             = useState({});
  const [searchOpen, setSearchOpen]     = useState(false);
  const [profileUserId, setProfileUserId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ignitionOpen, setIgnitionOpen] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [searchQuery, setSearchQuery]   = useState('');
  const [selectedFilter, setSelectedFilter] = useState(null);
  const [friendRequests, setFriendRequests] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [dimensions, setDimensions]     = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1000,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const canvasRef  = useRef(null);
  const rafRef     = useRef(null);
  const stateRef   = useRef({}); // physics state per node

  const contactIds = zones.map((z) => z.recipientId).filter(Boolean);
  const { getStatus, getLastSeen } = usePresence({ chatSocket, contactIds });

  // ── Fetch user's zones ────────────────────────────────────────────────────
  const fetchZones = () => {
    if (!chatJwt) return;

    Promise.all([
      fetch(`${API_BASE_URL}/channels`, {
        headers: { Authorization: `Bearer ${chatJwt}` },
      }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/users/me/profile`, {
        headers: { Authorization: `Bearer ${chatJwt}` },
      }).then((r) => r.json()),
    ])
      .then(([{ channels }, profileData]) => {
        const channelList = (channels || []).map((ch) => ({
          id: ch.id,
          name: ch.name,
          type: 'channel',
          memberCount: ch.memberCount,
          unreadCount: 0,
          isActive: false,
          isMuted: false,
          avatars: [],
        }));

        const dmList = (profileData?.user?.friends || []).map((fr) => ({
          id: fr._id || fr.id,
          name: fr.displayName || fr.yapperHandle,
          type: 'dm',
          recipientId: fr._id || fr.id,
          memberCount: 2,
          unreadCount: 0,
          isActive: false,
          isMuted: false,
          avatars: [{ name: fr.displayName, photoURL: fr.photoURL }],
        }));

        setFriendRequests(profileData?.user?.friendRequests || []);

        const zoneList = [...channelList, ...dmList];
        setZones(zoneList);
        initPositions(zoneList);
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetchZones();
  }, [chatJwt]);

  // ── Init positions (spread nodes across canvas) ───────────────────────────
  function initPositions(zoneList) {
    const isMobile = window.innerWidth <= 640;
    const W = isMobile ? window.innerWidth : window.innerWidth - 64;
    const H = isMobile ? window.innerHeight - 60 : window.innerHeight;
    const newPos = {};
    const newScales = {};
    const newState = {};

    zoneList.forEach((zone, i) => {
      const angle = (2 * Math.PI * i) / zoneList.length;
      const radius = Math.min(W, H) * 0.35;
      newPos[zone.id] = {
        x: W / 2 + radius * Math.cos(angle),
        y: H / 2 + radius * Math.sin(angle),
      };
      newScales[zone.id] = 1;
      newState[zone.id] = {
        position: { ...newPos[zone.id] },
        targetPosition: { ...newPos[zone.id] },
        scale: 1,
        targetScale: 1,
        inactiveMs: 0,
      };
    });

    setPositions(newPos);
    setScales(newScales);
    stateRef.current = newState;
  }

  // ── Zone Gravity physics loop ─────────────────────────────────────────────
  useEffect(() => {
    if (zones.length === 0) return;

    let lastTime = performance.now();

    function step(now) {
      const isMobile = window.innerWidth <= 640;
      const W = isMobile ? window.innerWidth : window.innerWidth - 64;
      const H = isMobile ? window.innerHeight - 60 : window.innerHeight;
      const center = { x: W / 2, y: H / 2 };

      const deltaMs = now - lastTime;
      lastTime = now;

      const newPos = {};
      const newScales = {};

      const posSpeed = 0.05;

      // 1. Target lerping
      zones.forEach((zone) => {
        const s = stateRef.current[zone.id];
        if (!s) return;

        // Inactivity tracker
        if (!zone.isActive && !zone.unreadCount) {
          s.inactiveMs += deltaMs;
        } else {
          s.inactiveMs = 0;
        }

        // Zone Gravity target calculations
        if (s.inactiveMs >= 30000) {
          s.targetScale = 1.0;
          // Drift to periphery: compute direction away from center
          const angle = Math.atan2(s.position.y - center.y, s.position.x - center.x);
          const peripheryRadius = Math.min(W, H) * 0.42;
          s.targetPosition = {
            x: center.x + peripheryRadius * Math.cos(angle),
            y: center.y + peripheryRadius * Math.sin(angle),
          };
        } else if (zone.isActive || zone.unreadCount > 0) {
          s.targetScale = 1.3;
          s.targetPosition = { x: center.x, y: center.y };
        }

        // Lerp scale
        const scaleDiff = s.targetScale - s.scale;
        const scaleSpeed = s.inactiveMs >= 30000 ? (deltaMs / 2000) : (deltaMs / 500);
        s.scale += scaleDiff * Math.min(scaleSpeed, 1);

        // Lerp position
        s.position.x += (s.targetPosition.x - s.position.x) * posSpeed;
        s.position.y += (s.targetPosition.y - s.position.y) * posSpeed;
      });

      // 2. Derive cluster node coordinates to act as static repellers
      const techFocalPoint = isMobile
        ? { x: W * 0.5, y: H * 0.32 }
        : { x: W * 0.38, y: H * 0.48 };

      const otherFocalPoint = isMobile
        ? { x: W * 0.5, y: H * 0.68 }
        : { x: W * 0.65, y: H * 0.52 };

      const channels = zones.filter((z) => z.type === 'channel');
      const techGalaxyNodes = channels.filter(
        (c) =>
          c.name.toLowerCase().includes('tech') ||
          c.name.toLowerCase().includes('dev') ||
          c.name.toLowerCase().includes('quantum')
      );
      const otherGalaxyNodes = channels.filter((c) => !techGalaxyNodes.some((tg) => tg.id === c.id));

      const clusterCoords = [];
      techGalaxyNodes.forEach((node, i) => {
        const baseAngle = (360 / techGalaxyNodes.length) * i;
        const angleRad = (baseAngle * Math.PI) / 180;
        clusterCoords.push({
          x: techFocalPoint.x + 95 * Math.cos(angleRad),
          y: techFocalPoint.y + 95 * Math.sin(angleRad),
        });
      });
      otherGalaxyNodes.forEach((node, i) => {
        const baseAngle = (360 / otherGalaxyNodes.length) * i;
        const angleRad = (baseAngle * Math.PI) / 180;
        clusterCoords.push({
          x: otherFocalPoint.x + 95 * Math.cos(angleRad),
          y: otherFocalPoint.y + 95 * Math.sin(angleRad),
        });
      });

      // 3. Resolve overlaps (repel from other standalone nodes)
      const minDistance = isMobile ? 85 : 115;
      const dms = zones.filter((z) => z.type === 'dm');

      for (let i = 0; i < dms.length; i++) {
        const idA = dms[i].id;
        const sA = stateRef.current[idA];
        if (!sA) continue;

        // Repel from other DM nodes
        for (let j = i + 1; j < dms.length; j++) {
          const idB = dms[j].id;
          const sB = stateRef.current[idB];
          if (!sB) continue;

          const dx = sB.position.x - sA.position.x;
          const dy = sB.position.y - sA.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;

          if (distance < minDistance) {
            const overlap = minDistance - distance;
            const forceX = (dx / distance) * overlap * 0.5;
            const forceY = (dy / distance) * overlap * 0.5;

            sA.position.x -= forceX;
            sA.position.y -= forceY;
            sB.position.x += forceX;
            sB.position.y += forceY;
          }
        }

        // Repel from static cluster nodes
        clusterCoords.forEach((cc) => {
          const dx = sA.position.x - cc.x;
          const dy = sA.position.y - cc.y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;

          if (distance < minDistance) {
            const overlap = minDistance - distance;
            const forceX = (dx / distance) * overlap * 0.9;
            const forceY = (dy / distance) * overlap * 0.9;

            sA.position.x += forceX;
            sA.position.y += forceY;
          }
        });
      }

      // 4. Boundary clamping: keep DM nodes within the visible canvas bounds
      const nodeRadius = 55; // 50px radius + 5px margin
      zones.forEach((zone) => {
        const s = stateRef.current[zone.id];
        if (!s || zone.type !== 'dm') return;

        // Clamp X coordinate
        if (s.position.x < nodeRadius) {
          s.position.x = nodeRadius;
        } else if (s.position.x > W - nodeRadius) {
          s.position.x = W - nodeRadius;
        }

        // Clamp Y coordinate
        if (s.position.y < nodeRadius) {
          s.position.y = nodeRadius;
        } else if (s.position.y > H - nodeRadius) {
          s.position.y = H - nodeRadius;
        }
      });

      // 5. Output final positions
      zones.forEach((zone) => {
        const s = stateRef.current[zone.id];
        if (!s) return;
        newPos[zone.id]    = { ...s.position };
        newScales[zone.id] = s.scale;
      });

      setPositions({ ...newPos });
      setScales({ ...newScales });
      rafRef.current = requestAnimationFrame(step);
    }

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [zones]);

  // Request system notification permission on first user click (required by browser security policies)
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        const handleFirstClick = () => {
          Notification.requestPermission().then((perm) => {
            console.log('[Notification] Permission response:', perm);
          });
          window.removeEventListener('click', handleFirstClick);
        };
        window.addEventListener('click', handleFirstClick);
        return () => window.removeEventListener('click', handleFirstClick);
      }
    }
  }, []);

  const playNotificationSound = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      // Pleasant dual-tone chime (D5 then A5)
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.1);
      
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (err) {
      console.warn('[Audio] Context sound blocked or failed:', err);
    }
  };

  const triggerSystemNotification = (title, body) => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/favicon.ico',
        });
      } catch (err) {
        console.error('[Notification] Error triggering alert:', err);
      }
    }
  };

  // ── React to incoming messages ───────────────────────────────────────────
  useEffect(() => {
    if (!chatSocket?.on) return;

    const handleDm = (msg, ack) => {
      updateZoneActivity(msg.from, 1);
      if (typeof ack === 'function') ack();

      // Don't notify if the message is from current user
      const isSelf = msg.from?.toString() === currentUserId?.toString() || msg.senderId?.toString() === currentUserId?.toString();
      if (isSelf) return;

      playNotificationSound();

      // Notify if document is hidden or user is not in a DM with this sender
      const isCurrentlyViewing = expandedZone?.type === 'dm' && expandedZone?.id?.toString() === msg.from?.toString();
      if (document.hidden || !isCurrentlyViewing) {
        triggerSystemNotification(
          `Message from ${msg.fromDisplayName || 'Friend'}`,
          msg.content
        );
      }
    };

    const handleCh = (msg) => {
      updateZoneActivity(msg.channelId, 1);

      // Don't notify if the message is from current user
      const isSelf = msg.from?.toString() === currentUserId?.toString() || msg.senderId?.toString() === currentUserId?.toString();
      if (isSelf) return;

      playNotificationSound();

      // Notify if document is hidden or user is not in this channel
      const isCurrentlyViewing = expandedZone?.type === 'channel' && expandedZone?.id === msg.channelId;
      if (document.hidden || !isCurrentlyViewing) {
        const zoneName = zones.find((z) => z.id === msg.channelId)?.name || 'Zone';
        triggerSystemNotification(
          `${msg.fromDisplayName || 'User'} in #${zoneName}`,
          msg.content
        );
      }
    };

    const u1 = chatSocket.on('dm:receive',      handleDm);
    const u2 = chatSocket.on('channel:message', handleCh);
    return () => { u1?.(); u2?.(); };
  }, [chatSocket?.on, zones, expandedZone]);

  function updateZoneActivity(zoneId, delta) {
    setZones((prev) => prev.map((z) =>
      z.id === zoneId ? { ...z, unreadCount: z.unreadCount + delta, isActive: true } : z
    ));

    const s = stateRef.current[zoneId];
    if (!s) return;
    const W = window.innerWidth - 64;
    const H = window.innerHeight;
    s.targetPosition = { x: W / 2, y: H / 2 };
    s.targetScale    = 1.3;
    s.inactiveMs     = 0;
  }

  // ── Search & Filter tags ──────────────────────────────────────────────────
  const filteredZones = zones.filter((zone) => {
    if (searchQuery && !zone.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (selectedFilter === 'Active') {
      return zone.isActive;
    }
    if (selectedFilter === 'Muted') {
      return zone.isMuted;
    }
    if (selectedFilter === 'Friends') {
      return zone.type === 'dm';
    }
    return true;
  });

  const channels = filteredZones.filter((z) => z.type === 'channel');
  const dms      = filteredZones.filter((z) => z.type === 'dm');

  // Galaxy Clusters grouping
  const techGalaxyNodes = channels.filter(
    (c) =>
      c.name.toLowerCase().includes('tech') ||
      c.name.toLowerCase().includes('dev') ||
      c.name.toLowerCase().includes('quantum')
  );
  const otherGalaxyNodes = channels.filter((c) => !techGalaxyNodes.some((tg) => tg.id === c.id));

  // Cluster focal points (central-to-mid region)
  const isMobile = dimensions.width <= 640;
  const W_width = isMobile ? dimensions.width : dimensions.width - 64;
  const H_height = isMobile ? dimensions.height - 60 : dimensions.height;

  const techFocalPoint = isMobile
    ? { x: W_width * 0.5, y: H_height * 0.32 }
    : { x: W_width * 0.38, y: H_height * 0.48 };

  const otherFocalPoint = isMobile
    ? { x: W_width * 0.5, y: H_height * 0.68 }
    : { x: W_width * 0.65, y: H_height * 0.52 };

  // Calculate active CometInput position
  const getSelectedNodePosition = () => {
    if (!activeNode) return null;
    if (activeNode.type === 'dm') {
      return positions[activeNode.id] || { x: 200, y: 200 };
    }
    // Search in tech galaxy
    const techIdx = techGalaxyNodes.findIndex((n) => n.id === activeNode.id);
    if (techIdx > -1) {
      const angle = (2 * Math.PI * techIdx) / techGalaxyNodes.length;
      return {
        x: techFocalPoint.x + 95 * Math.cos(angle),
        y: techFocalPoint.y + 95 * Math.sin(angle),
      };
    }
    // Search in other galaxy
    const otherIdx = otherGalaxyNodes.findIndex((n) => n.id === activeNode.id);
    if (otherIdx > -1) {
      const angle = (2 * Math.PI * otherIdx) / otherGalaxyNodes.length;
      return {
        x: otherFocalPoint.x + 95 * Math.cos(angle),
        y: otherFocalPoint.y + 95 * Math.sin(angle),
      };
    }
    return { x: 200, y: 200 };
  };

  const handleCometSend = (node, text) => {
    if (node.type === 'dm') {
      chatSocket?.sendDm(node.recipientId, text);
    } else {
      chatSocket?.sendChannelMessage(node.id, text);
    }
  };

  const handleNodeClick = (z) => {
    const isMobileDevice = dimensions.width <= 640;
    if (isMobileDevice) {
      setExpandedZone(z);
    } else {
      setActiveNode(z);
    }
    setZones((prev) =>
      prev.map((p) => (p.id === z.id ? { ...p, unreadCount: 0 } : p))
    );
  };

  return (
    <div className={styles.hub}>
      <Sidebar
        onNewZone={() => setIgnitionOpen(true)}
        onExplorer={() => setExplorerOpen(true)}
        onSearch={() => setSearchOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        onProfile={() => setProfileUserId(currentUserId)}
        hasNotifications={friendRequests.length > 0}
        onNotifications={() => setNotificationsOpen(true)}
      />

      <div ref={canvasRef} className={`${styles.canvas} cosmic-canvas`}>
        {/* Stars background */}
        <div className={styles.stars} />
        {/* Liquid aurora blob */}
        <div className={styles.auroraBlob} />

        {/* Zonal top navigation bar */}
        <ZonalNavigationBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedFilter={selectedFilter}
          onFilterChange={setSelectedFilter}
        />

        {/* Tech Galaxy Cluster */}
        {techGalaxyNodes.length > 0 && (
          <GalaxyCluster
            name="Trending Tech"
            nodes={techGalaxyNodes}
            focalPoint={techFocalPoint}
            scales={scales}
            selectedZone={activeNode}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={(z) => {
              setExpandedZone(z);
            }}
          />
        )}

        {/* Other Galaxies Cluster */}
        {otherGalaxyNodes.length > 0 && (
          <GalaxyCluster
            name="Art Galaxies"
            nodes={otherGalaxyNodes}
            focalPoint={otherFocalPoint}
            scales={scales}
            selectedZone={activeNode}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={(z) => {
              setExpandedZone(z);
            }}
          />
        )}

        {/* Peripheral standalone DM nodes */}
        {dms.map((zone) => (
          <OrbitalNode
            key={zone.id}
            zone={zone}
            position={positions[zone.id] || { x: 200, y: 200 }}
            scale={scales[zone.id] || 1}
            isSelected={activeNode?.id === zone.id}
            status={getStatus(zone.recipientId)}
            onClick={handleNodeClick}
            onDoubleClick={(z) => {
              setExpandedZone(z);
            }}
          />
        ))}

        {/* Comet Input docking below the single-clicked active node */}
        {activeNode && (
          <CometInput
            activeNode={activeNode}
            nodePosition={getSelectedNodePosition()}
            onSend={handleCometSend}
          />
        )}

        {/* Empty state */}
        {zones.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyOrb} />
            <div className={styles.emptyOrb2} />
            <div className={styles.emptyContent}>
              <div className={styles.emptyIcon}>
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="24" r="22" stroke="rgba(0,229,255,0.3)" strokeWidth="1.5" strokeDasharray="4 4"/>
                  <circle cx="24" cy="24" r="14" stroke="rgba(0,229,255,0.15)" strokeWidth="1"/>
                  <circle cx="24" cy="24" r="6" fill="rgba(0,229,255,0.1)" stroke="rgba(0,229,255,0.4)" strokeWidth="1.5"/>
                  <circle cx="24" cy="24" r="2" fill="#00e5ff"/>
                </svg>
              </div>
              <h3 className={styles.emptyTitle}>Your Canvas is Empty</h3>
              <p className={styles.emptySub}>Create a Zone to start chatting, or search for people to connect with</p>
              <div className={styles.emptyActions}>
                <button className={styles.emptyBtnPrimary} onClick={() => setSearchOpen(true)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M16 16 L21 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  Find People
                </button>
                <button className={styles.emptyBtnSecondary} onClick={() => setIgnitionOpen(true)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  Create Zone
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Expanded chat overlay */}
      <AnimatePresence>
        {expandedZone && (
          <ExpandedChatView
            key={expandedZone.id}
            zone={expandedZone}
            currentUserId={currentUserId}
            chatJwt={chatJwt}
            chatSocket={chatSocket}
            getStatus={getStatus}
            getLastSeen={getLastSeen}
            onClose={() => setExpandedZone(null)}
          />
        )}
      </AnimatePresence>

      {/* Settings panel */}
      <AnimatePresence>
        {settingsOpen && (
          <SettingsPanel
            chatJwt={chatJwt}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Zone Ignition wizard */}
      <AnimatePresence>
        {ignitionOpen && (
          <ZoneIgnitionSystem
            chatJwt={chatJwt}
            onClose={() => setIgnitionOpen(false)}
            onSuccess={(ch) => {
              // Refresh channel list and add to canvas
              fetchZones();
            }}
          />
        )}
      </AnimatePresence>

      {/* Cosmic Explorer Discovery overlay */}
      <AnimatePresence>
        {explorerOpen && (
          <CosmicExplorer
            chatJwt={chatJwt}
            chatSocket={chatSocket}
            onClose={() => setExplorerOpen(false)}
            onSuccess={(ch) => {
              fetchZones();
            }}
          />
        )}
      </AnimatePresence>

      {/* Global search overlay */}
      <AnimatePresence>
        {searchOpen && (
          <GlobalSearch
            chatJwt={chatJwt}
            currentUserId={currentUserId}
            onClose={() => setSearchOpen(false)}
            onViewProfile={(uid) => { setProfileUserId(uid); setSearchOpen(false); }}
          />
        )}
      </AnimatePresence>

      {/* Profile modal */}
      <AnimatePresence>
        {profileUserId && (
          <ProfileModal
            userId={profileUserId}
            currentUserId={currentUserId}
            chatJwt={chatJwt}
            onClose={() => setProfileUserId(null)}
            onMessage={(user) => {
              // Open a DM zone with this user
              setExpandedZone({
                id: user.id,
                name: user.displayName,
                type: 'dm',
                recipientId: user.id,
                memberCount: 2,
                avatars: [{ name: user.displayName, photoURL: user.photoURL }],
                unreadCount: 0,
                isActive: false,
              });
            }}
          />
        )}
      </AnimatePresence>

      {/* Friend requests inbox */}
      <AnimatePresence>
        {notificationsOpen && (
          <FriendRequestsModal
            friendRequests={friendRequests}
            chatJwt={chatJwt}
            onClose={() => setNotificationsOpen(false)}
            onActionComplete={() => {
              fetchZones();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
