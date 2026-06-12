import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import OrbitalNode from './OrbitalNode';
import Sidebar from './Sidebar';
import ExpandedChatView from './ExpandedChatView';
import { usePresence } from '../../hooks/usePresence';
import { API_BASE_URL } from '../../firebaseClient';
import styles from './YappersHub.module.css';

/**
 * YappersHub — the main Cosmic Canvas view.
 *
 * Requirements 12.1–12.6, 15.1–15.6:
 *   - Renders OrbitalNodes for all user zones on a cosmic canvas
 *   - Zone Gravity: active/unread nodes drift toward center
 *   - Click node → ExpandedChatView
 *   - New messages update node glow/position in real time
 */
export default function YappersHub({ chatJwt, chatSocket, currentUserId }) {
  const [zones, setZones]           = useState([]);
  const [selectedZone, setSelectedZone] = useState(null);
  const [positions, setPositions]   = useState({});
  const [scales, setScales]         = useState({});
  const canvasRef  = useRef(null);
  const rafRef     = useRef(null);
  const stateRef   = useRef({}); // physics state per node

  const contactIds = zones.map((z) => z.recipientId).filter(Boolean);
  const { getStatus } = usePresence({ chatSocket, contactIds });

  // ── Fetch user's zones ────────────────────────────────────────────────────
  useEffect(() => {
    if (!chatJwt) return;
    fetch(`${API_BASE_URL}/channels`, {
      headers: { Authorization: `Bearer ${chatJwt}` },
    })
      .then((r) => r.json())
      .then(({ channels }) => {
        const zoneList = (channels || []).map((ch) => ({
          id: ch.id,
          name: ch.name,
          type: 'channel',
          memberCount: ch.memberCount,
          unreadCount: 0,
          isActive: false,
          avatars: [],
        }));
        setZones(zoneList);
        initPositions(zoneList);
      })
      .catch(console.error);
  }, [chatJwt]);

  // ── Init positions (spread nodes across canvas) ───────────────────────────
  function initPositions(zoneList) {
    const W = window.innerWidth - 64;  // subtract sidebar width
    const H = window.innerHeight;
    const newPos = {};
    const newScales = {};
    const newState = {};

    zoneList.forEach((zone, i) => {
      const angle = (2 * Math.PI * i) / zoneList.length;
      const radius = Math.min(W, H) * 0.3;
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

        // Scale
        const diff = s.targetScale - s.scale;
        s.scale += diff * Math.min(deltaMs / 500, 1);

        // Position lerp
        s.position.x += (s.targetPosition.x - s.position.x) * 0.05;
        s.position.y += (s.targetPosition.y - s.position.y) * 0.05;

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

  // ── React to incoming messages: update unread + node gravity ─────────────
  useEffect(() => {
    if (!chatSocket?.on) return;

    const handleDm = (msg) => updateZoneActivity(msg.from, 1);
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
    s.targetPosition = { x: W / 2, y: H / 2 }; // migrate toward center
    s.targetScale    = 1.3;
  }

  return (
    <div className={styles.hub}>
      <Sidebar
        onNewZone={() => {/* TODO: ZoneIgnitionSystem */}}
        onSearch={() => {/* TODO: CosmicExplorer */}}
      />

      <div ref={canvasRef} className={`${styles.canvas} cosmic-canvas`}>
        {/* Stars background */}
        <div className={styles.stars} />

        {/* Orbital nodes */}
        {zones.map((zone) => (
          <OrbitalNode
            key={zone.id}
            zone={zone}
            position={positions[zone.id] || { x: 200, y: 200 }}
            scale={scales[zone.id] || 1}
            isSelected={selectedZone?.id === zone.id}
            onClick={(z) => {
              setSelectedZone(z);
              // Clear unread when opening
              setZones((prev) => prev.map((p) =>
                p.id === z.id ? { ...p, unreadCount: 0 } : p
              ));
            }}
          />
        ))}

        {/* Empty state */}
        {zones.length === 0 && (
          <div className={styles.emptyState}>
            <p className="text-secondary">No zones yet. Create one to start chatting!</p>
          </div>
        )}
      </div>

      {/* Expanded chat overlay */}
      <AnimatePresence>
        {selectedZone && (
          <ExpandedChatView
            key={selectedZone.id}
            zone={selectedZone}
            currentUserId={currentUserId}
            chatJwt={chatJwt}
            chatSocket={chatSocket}
            onClose={() => setSelectedZone(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
