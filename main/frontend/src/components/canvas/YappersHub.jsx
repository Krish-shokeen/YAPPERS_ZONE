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
    const W = window.innerWidth - 64;
    const H = window.innerHeight;
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

    const W = window.innerWidth - 64;
    const H = window.innerHeight;
    const center = { x: W / 2, y: H / 2 };
    let lastTime = performance.now();

    function step(now) {
      const deltaMs = now - lastTime;
      lastTime = now;

      const newPos = {};
      const newScales = {};

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
        const posSpeed = s.inactiveMs >= 30000 ? 0.02 : 0.05;
        s.position.x += (s.targetPosition.x - s.position.x) * posSpeed;
        s.position.y += (s.targetPosition.y - s.position.y) * posSpeed;

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

  // ── React to incoming messages ───────────────────────────────────────────
  useEffect(() => {
    if (!chatSocket?.on) return;

    const handleDm = (msg, ack) => {
      updateZoneActivity(msg.from, 1);
      if (typeof ack === 'function') ack();
    };
    const handleCh = (msg) => updateZoneActivity(msg.channelId, 1);

    const u1 = chatSocket.on('dm:receive',      handleDm);
    const u2 = chatSocket.on('channel:message', handleCh);
    return () => { u1?.(); u2?.(); };
  }, [chatSocket?.on, zones]);

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
  const W_width = window.innerWidth - 64;
  const H_height = window.innerHeight;
  const techFocalPoint = { x: W_width * 0.38, y: H_height * 0.48 };
  const otherFocalPoint = { x: W_width * 0.65, y: H_height * 0.52 };

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
            onNodeClick={(z) => {
              setActiveNode(z);
              setZones((prev) =>
                prev.map((p) => (p.id === z.id ? { ...p, unreadCount: 0 } : p))
              );
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
            onNodeClick={(z) => {
              setActiveNode(z);
              setZones((prev) =>
                prev.map((p) => (p.id === z.id ? { ...p, unreadCount: 0 } : p))
              );
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
            onClick={(z) => {
              setActiveNode(z);
              setZones((prev) =>
                prev.map((p) => (p.id === z.id ? { ...p, unreadCount: 0 } : p))
              );
            }}
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
