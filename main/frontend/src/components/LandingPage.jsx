import { useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './LandingPage.css';

/* ─── Custom Cursor — rendered in a portal directly on body ─────────────────
   This guarantees it always paints above EVERYTHING else on the page.
   We also force z-index to Number.MAX_SAFE_INTEGER equivalent (2147483647).
─────────────────────────────────────────────────────────────────────────── */
function CosmicCursor() {
  const dotRef  = useRef(null);
  const ringRef = useRef(null);
  const pos     = useRef({ x: -100, y: -100 });
  const ring    = useRef({ x: -100, y: -100 });
  const hovRef  = useRef(false);

  useEffect(() => {
    // Direct DOM transform — fastest possible, bypasses React re-renders
    const move = (e) => {
      pos.current.x = e.clientX;
      pos.current.y = e.clientY;
      if (dotRef.current) {
        dotRef.current.style.transform =
          `translate(${e.clientX - 4}px, ${e.clientY - 4}px)`;
      }
    };

    let raf;
    const lerp = (a, b, t) => a + (b - a) * t;
    const tick = () => {
      ring.current.x = lerp(ring.current.x, pos.current.x, 0.10);
      ring.current.y = lerp(ring.current.y, pos.current.y, 0.10);
      if (ringRef.current) {
        ringRef.current.style.transform =
          `translate(${ring.current.x - 20}px, ${ring.current.y - 20}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    window.addEventListener('mousemove', move, { passive: true });

    // Hover detection — delegate to document so we catch ALL elements
    const onEnter = (e) => {
      if (e.target.closest('button, a, input, textarea, [data-hover]')) {
        hovRef.current = true;
        dotRef.current?.classList.add('cursor-hover');
        ringRef.current?.classList.add('cursor-hover');
      }
    };
    const onLeave = (e) => {
      if (e.target.closest('button, a, input, textarea, [data-hover]')) {
        hovRef.current = false;
        dotRef.current?.classList.remove('cursor-hover');
        ringRef.current?.classList.remove('cursor-hover');
      }
    };
    document.addEventListener('mouseover',  onEnter, true);
    document.addEventListener('mouseout',   onLeave, true);

    return () => {
      window.removeEventListener('mousemove', move);
      document.removeEventListener('mouseover',  onEnter, true);
      document.removeEventListener('mouseout',   onLeave, true);
      cancelAnimationFrame(raf);
    };
  }, []);

  return createPortal(
    <>
      <div ref={dotRef}  className="cursor-dot"  />
      <div ref={ringRef} className="cursor-ring" />
    </>,
    document.body
  );
}

/* ─── Animated star canvas ──────────────────────────────────────────────────── */
function StarCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    
    let mouse = { x: -1000, y: -1000 };
    const moveMouse = (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    window.addEventListener('mousemove', moveMouse, { passive: true });

    const stars = Array.from({ length: 220 }, () => {
      const sx = Math.random() * window.innerWidth;
      const sy = Math.random() * window.innerHeight;
      return {
        x: sx,
        y: sy,
        ox: sx,
        oy: sy,
        r: Math.random() * 1.3 + 0.2,
        a: Math.random(),
        s: Math.random() * 0.004 + 0.001,
      };
    });

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      stars.forEach((s) => {
        s.ox = Math.random() * canvas.width;
        s.oy = Math.random() * canvas.height;
        s.x = s.ox;
        s.y = s.oy;
      });
    };
    resize();
    window.addEventListener('resize', resize);

    const orbs = [
      { x: 0.15, y: 0.25, r: 200, c: 'rgba(0,229,255,0.06)', s: 0.0005 },
      { x: 0.80, y: 0.60, r: 260, c: 'rgba(123,47,255,0.07)', s: -0.0003 },
      { x: 0.50, y: 0.80, r: 180, c: 'rgba(255,110,199,0.05)', s: 0.0004 },
    ];
    let angle = 0;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      angle += 0.003;

      // Animated nebula orbs
      orbs.forEach((o) => {
        const x = canvas.width  * o.x + Math.sin(angle * 0.7) * 40;
        const y = canvas.height * o.y + Math.cos(angle * 0.5) * 30;
        const g = ctx.createRadialGradient(x, y, 0, x, y, o.r);
        g.addColorStop(0, o.c);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, o.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // Stars with gravitational warp pull
      stars.forEach((s) => {
        s.a += s.s;
        if (s.a > 1 || s.a < 0) s.s *= -1;

        const dx = mouse.x - s.ox;
        const dy = mouse.y - s.oy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        const maxDist = 280;
        let targetX = s.ox;
        let targetY = s.oy;
        
        if (dist < maxDist) {
          const force = (maxDist - dist) / maxDist;
          // Attract stars slightly towards cursor
          targetX += (dx / dist) * force * 35;
          targetY += (dy / dist) * force * 35;
        }

        // Lerping to create smooth organic wave movement
        s.x += (targetX - s.x) * 0.08;
        s.y += (targetY - s.y) * 0.08;

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${s.a * 0.65})`;
        ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', moveMouse);
    };
  }, []);
  return <canvas ref={ref} className="lp-canvas" />;
}

/* ─── FeatureCard Component ────────────────────────────────────────────────── */
function FeatureCard({ icon, title, desc, glowColor, children }) {
  const ref = useRef(null);

  const handleMouseMove = (e) => {
    const card = ref.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    card.style.setProperty('--mx', `${x}px`);
    card.style.setProperty('--my', `${y}px`);
  };

  return (
    <div
      ref={ref}
      className="lp-feat-card"
      onMouseMove={handleMouseMove}
      data-hover
    >
      <div className="lp-feat-card-glow" style={{ '--gc': glowColor }} />
      <div className="lp-feat-icon" style={{ color: glowColor }}>{icon}</div>
      <h3 className="lp-feat-title" style={{ color: glowColor }}>{title}</h3>
      <p className="lp-feat-desc">{desc}</p>
      {children}
    </div>
  );
}

/* ─── Isometric App Mockup ──────────────────────────────────────────────────── */
function IsoMockup() {
  const [activeNode, setActiveNode] = useState(null);

  const nodes = [
    { id: 'center', label: 'Team Alpha', status: '8 online · Active', msg: 'hotfix is building... 🚀' },
    { id: '1', label: 'Gaming', status: '3 yapping', msg: 'clutched that 1v3! 🤯' },
    { id: '2', label: 'Study', status: 'Quiet focus', msg: 'reading docs for Vite 7' },
    { id: '3', label: 'Coffee', status: '5 yappers', msg: 'highly caffeinated yaps ☕' }
  ];

  return (
    <div className="iso-wrap">
      <div className="iso-scene">
        {/* Main canvas window */}
        <div className="iso-window">
          <div className="iso-topbar">
            <div className="iso-dot" style={{ background: '#ff5f57' }} />
            <div className="iso-dot" style={{ background: '#febc2e' }} />
            <div className="iso-dot" style={{ background: '#28c840' }} />
            <span className="iso-title">Yappers Zone — Cosmic Canvas</span>
          </div>
          <div className="iso-body">
            {/* Sidebar */}
            <div className="iso-sidebar">
              {/* Chat */}
              <svg className="iso-sb-icon" viewBox="0 0 24 24" fill="none">
                <path d="M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H8l-4 4V5a1 1 0 0 1 1-1z" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
              {/* Search */}
              <svg className="iso-sb-icon" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="6" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5"/>
                <path d="M16 16 L20 20" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {/* Plus */}
              <svg className="iso-sb-icon" viewBox="0 0 24 24" fill="none">
                <line x1="12" y1="5" x2="12" y2="19" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="5" y1="12" x2="19" y2="12" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {/* Settings */}
              <svg className="iso-sb-icon" viewBox="0 0 24 24" fill="none" style={{ marginTop: 'auto' }}>
                <circle cx="12" cy="12" r="3" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5"/>
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            {/* Canvas area with nodes */}
            <div className="iso-canvas">
              {/* Glowing spatial connection lines */}
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                <line x1="171" y1="91" x2="61" y2="41" stroke="rgba(0,229,255,0.18)" strokeWidth="1.5" strokeDasharray="3 3" />
                <line x1="171" y1="91" x2="71" y2="171" stroke="rgba(0,229,255,0.18)" strokeWidth="1.5" strokeDasharray="3 3" />
                <line x1="171" y1="91" x2="291" y2="211" stroke="rgba(0,229,255,0.18)" strokeWidth="1.5" strokeDasharray="3 3" />
              </svg>

              {/* Node Center */}
              <div 
                className="iso-node iso-node-center" 
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setActiveNode(nodes[0])}
                onMouseLeave={() => setActiveNode(null)}
              >
                <div className="iso-node-ring" />
                <svg className="iso-node-icon" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="8" r="3" fill="#00e5ff"/>
                  <circle cx="6"  cy="15" r="2" fill="#00e5ff" opacity="0.7"/>
                  <circle cx="18" cy="15" r="2" fill="#00e5ff" opacity="0.7"/>
                  <line x1="12" y1="11" x2="6"  y2="13" stroke="#00e5ff" strokeWidth="1.5" opacity="0.5"/>
                  <line x1="12" y1="11" x2="18" y2="13" stroke="#00e5ff" strokeWidth="1.5" opacity="0.5"/>
                </svg>
                <span className="iso-node-label">Team Alpha</span>
              </div>

              {/* Node 1 */}
              <div 
                className="iso-node iso-node-1" 
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setActiveNode(nodes[1])}
                onMouseLeave={() => setActiveNode(null)}
              >
                <div className="iso-node-ring iso-ring-purple" />
                <svg className="iso-node-icon" viewBox="0 0 24 24" fill="none">
                  <rect x="4" y="6" width="16" height="12" rx="2" stroke="#7b2fff" strokeWidth="1.5"/>
                  <circle cx="8"  cy="12" r="1.5" fill="#7b2fff"/>
                  <circle cx="16" cy="12" r="1.5" fill="#7b2fff"/>
                  <rect x="10" y="10" width="4" height="4" rx="0.5" fill="#7b2fff" opacity="0.5"/>
                </svg>
                <span className="iso-node-label">Gaming</span>
              </div>

              {/* Node 2 */}
              <div 
                className="iso-node iso-node-2" 
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setActiveNode(nodes[2])}
                onMouseLeave={() => setActiveNode(null)}
              >
                <div className="iso-node-ring iso-ring-pink" />
                <svg className="iso-node-icon" viewBox="0 0 24 24" fill="none">
                  <rect x="4" y="4" width="12" height="16" rx="1.5" stroke="#ff6ec7" strokeWidth="1.5"/>
                  <line x1="7" y1="8"  x2="13" y2="8"  stroke="#ff6ec7" strokeWidth="1.5"/>
                  <line x1="7" y1="11" x2="13" y2="11" stroke="#ff6ec7" strokeWidth="1.5"/>
                  <line x1="7" y1="14" x2="11" y2="14" stroke="#ff6ec7" strokeWidth="1.5"/>
                  <path d="M15 14 L19 18" stroke="#ff6ec7" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span className="iso-node-label">Study</span>
              </div>

              {/* Node 3 */}
              <div 
                className="iso-node iso-node-3" 
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setActiveNode(nodes[3])}
                onMouseLeave={() => setActiveNode(null)}
              >
                <div className="iso-node-ring iso-ring-purple" />
                <svg className="iso-node-icon" viewBox="0 0 24 24" fill="none">
                  <path d="M7 4 Q7 2 12 2 Q17 2 17 4 L17 14 Q17 18 12 18 Q7 18 7 14 Z" stroke="#ffaa00" strokeWidth="1.5"/>
                  <path d="M17 7 Q21 7 21 11 Q21 14 17 14" stroke="#ffaa00" strokeWidth="1.5"/>
                  <rect x="9" y="18" width="6" height="2" rx="0.5" fill="#ffaa00" opacity="0.6"/>
                  <line x1="7" y1="20" x2="17" y2="20" stroke="#ffaa00" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span className="iso-node-label">Coffee</span>
              </div>

              {/* Tooltip speech bubble */}
              {activeNode && (
                <div className={`iso-tooltip iso-tooltip-${activeNode.id}`}>
                  <span className="iso-tooltip-title">{activeNode.label}</span>
                  <span className="iso-tooltip-status">{activeNode.status}</span>
                  <p className="iso-tooltip-msg">"{activeNode.msg}"</p>
                </div>
              )}

              <div className="iso-comet-input">
                <span>Start Yapping…</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 6 L10 6 M7 3 L10 6 L7 9" stroke="#00e5ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Live Demo / Whisper Stream ────────────────────────────────────────────── */
function WhisperDemo() {
  const [stream, setStream] = useState([
    { user: 'Krish',  color: '#00e5ff', text: 'yo the new build is live 🚀' },
    { user: 'Tarun',  color: '#7b2fff', text: 'bro it looks insane!! the nodes 🤯' },
    { user: 'Yash',   color: '#ff6ec7', text: 'the comet input is so smooth 👀' },
  ]);
  const [userText, setUserText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const containerRef = useRef(null);

  const mockPredefined = [
    { user: 'Nikhil', color: '#00ff88', text: 'already claiming my zone 😤' },
    { user: 'Krish',  color: '#00e5ff', text: 'hahaha zone gravity working perfectly' },
    { user: 'Tarun',  color: '#7b2fff', text: 'typing indicator is crispy ✓✓' },
    { user: 'Yash',   color: '#ff6ec7', text: 'WebRTC calls next?? 📞' },
    { user: 'Nikhil', color: '#00ff88', text: 'LETS GOOO 🔥🔥🔥' },
  ];
  const nextMockIndex = useRef(0);

  // Auto-scroll to bottom of stream container locally (avoiding window scrolling)
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [stream, isTyping]);

  // Simulate incoming yaps periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (nextMockIndex.current < mockPredefined.length) {
        setIsTyping(true);
        setTimeout(() => {
          setStream(prev => [...prev, mockPredefined[nextMockIndex.current]]);
          nextMockIndex.current += 1;
          setIsTyping(false);
        }, 1200);
      }
    }, 4500);

    return () => clearInterval(interval);
  }, []);

  const handleSend = (e) => {
    e.preventDefault();
    if (!userText.trim()) return;

    setStream(prev => [
      ...prev,
      { user: 'You (Yapper)', color: '#00ffff', text: userText.trim(), isUser: true }
    ]);
    setUserText('');
  };

  return (
    <div className="demo-stream">
      <div className="demo-header">
        <div className="demo-pulse" />
        <span>Live — Whisper Stream Playground</span>
        <span className="demo-users">4 online</span>
      </div>
      <div className="demo-messages" ref={containerRef}>
        {stream.map((m, i) => (
          <div
            key={i}
            className={`demo-msg ${m.isUser ? 'demo-msg-user' : ''}`}
            style={{ '--c': m.color }}
          >
            <span className="demo-user" style={{ color: m.color }}>{m.user}</span>
            <span className="demo-text">{m.text}</span>
          </div>
        ))}
        {isTyping && (
          <div className="demo-typing">
            <span className="demo-typing-dots">
              <span /><span /><span />
            </span>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
              Someone is typing…
            </span>
          </div>
        )}
      </div>
      <form onSubmit={handleSend} className="demo-input-form">
        <input
          type="text"
          value={userText}
          onChange={(e) => setUserText(e.target.value)}
          placeholder="Type something to yap..."
          className="demo-input-field"
          data-hover
        />
        <button type="submit" className="demo-send-btn" data-hover>
          Send
        </button>
      </form>
    </div>
  );
}

/* ─── Main Landing Page ─────────────────────────────────────────────────────── */
export default function LandingPage() {
  const navigate = useNavigate();
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const move = (e) => setMousePos({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, []);

  return (
    <div className="lp-root">
      <CosmicCursor />
      <StarCanvas />

      {/* Parallax nebula layer */}
      <div
        className="lp-parallax-blob"
        style={{
          transform: `translate(${mousePos.x * -30}px, ${mousePos.y * -20}px)`,
        }}
      />

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="lp-nav">
        <button className="lp-logo" onClick={() => navigate('/')}>
          <div className="lp-logo-mark">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <defs>
                <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#00e5ff"/>
                  <stop offset="100%" stopColor="#7b2fff"/>
                </linearGradient>
              </defs>
              <rect width="32" height="32" rx="10" fill="url(#logoGrad)" opacity="0.15"/>
              <rect width="32" height="32" rx="10" stroke="url(#logoGrad)" strokeWidth="1.5" fill="none"/>
              <path d="M8 10 Q8 8 10 8 L22 8 Q24 8 24 10 L24 18 Q24 20 22 20 L14 20 L11 23 L11 20 L10 20 Q8 20 8 18 Z"
                fill="url(#logoGrad)" opacity="0.9"/>
              <circle cx="13" cy="14" r="1.2" fill="white"/>
              <circle cx="16" cy="14" r="1.2" fill="white"/>
              <circle cx="19" cy="14" r="1.2" fill="white"/>
            </svg>
          </div>
          <span className="lp-logo-text">Yappers Zone</span>
        </button>
        <div className="lp-nav-center">
          <a href="#features"  className="lp-nav-link">Features</a>
          <a href="#demo"      className="lp-nav-link">Live Demo</a>
          <a href="#footer"    className="lp-nav-link">About</a>
        </div>
        <div className="lp-nav-btns">
          <button className="lp-btn-ghost" data-hover onClick={() => navigate('/login')}>Login</button>
          <button className="lp-btn-glow"  data-hover onClick={() => navigate('/signup')}>
            Get Started →
          </button>
        </div>
      </nav>

      {/* ══ HERO ═══════════════════════════════════════════════════════════════ */}
      <section className="lp-hero">
        <div className="lp-hero-left">
          <div className="lp-eyebrow">
            <span className="lp-eyebrow-dot" />
            Real-time · Spatial · Encrypted
          </div>

          <h1 className="lp-hero-title">
            Stop Scrolling.<br />
            <span className="lp-gradient-text">Start Yapping.</span>
          </h1>

          <p className="lp-hero-sub">
            Yappers Zone replaces boring chat lists with an
            interactive, gravity-driven cosmic canvas where your
            most important conversations <em>pull you in</em>.
          </p>

          <div className="lp-hero-btns">
            <button
              className="lp-cta-main"
              data-hover
              onClick={() => navigate('/signup')}
            >
              Launch App
              <span className="lp-cta-arrow">→</span>
            </button>
            <button className="lp-btn-ghost" data-hover onClick={() => navigate('/login')}>
              Sign In
            </button>
          </div>

          <div className="lp-stats">
            {[
              { num: '10K+', label: 'Active Users',    color: '#00e5ff' },
              { num: '1M+',  label: 'Messages Daily',  color: '#7b2fff' },
              { num: '99.9%',label: 'Uptime',          color: '#ff6ec7' },
            ].map((s) => (
              <div key={s.label} className="lp-stat">
                <span className="lp-stat-num" style={{ color: s.color }}>{s.num}</span>
                <span className="lp-stat-label">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        <IsoMockup />
      </section>

      {/* ══ FEATURES ═══════════════════════════════════════════════════════════ */}
      <section className="lp-features" id="features">
        <div className="lp-section-label">✦ Unique Mechanics</div>
        <h2 className="lp-section-title">
          Not a Chat App.<br />
          <span className="lp-gradient-text">A Spatial Universe.</span>
        </h2>
        <p className="lp-section-sub">
          Three mechanics that make Yappers Zone feel like nothing else.
        </p>

        <div className="lp-feat-grid">
          <FeatureCard
            icon="🌌"
            title="Activity Gravity"
            desc="Important chats pull you in. Watch active zones physically migrate to the center of your screen based on real-time message velocity and typing signals."
            glowColor="#00e5ff"
          >
            <div className="lp-feat-demo lp-demo-gravity">
              <div className="lp-gravity-node lp-gn-active">Team 🔥</div>
              <div className="lp-gravity-node lp-gn-idle">Study</div>
              <div className="lp-gravity-node lp-gn-idle lp-gn-far">Gaming</div>
              <div className="lp-gravity-arrow">← pulls toward center</div>
            </div>
          </FeatureCard>

          <FeatureCard
            icon="☄️"
            title="The Comet Input"
            desc="Context is everything. Type directly under the node you are talking to. The input field docks to your zone and moves with it, trailing a light stream."
            glowColor="#7b2fff"
          >
            <div className="lp-feat-demo lp-demo-comet">
              <div className="lp-comet-node">☕ Coffee Break</div>
              <div className="lp-comet-trail" />
              <div className="lp-comet-field">Start Yapping… <span>➤</span></div>
            </div>
          </FeatureCard>

          <FeatureCard
            icon="⚡"
            title="Zero Latency"
            desc="Powered by Socket.io WebSockets and a Node.js engine. Messages deliver in under 300 ms. Presence, typing, and read receipts update in real time across all devices."
            glowColor="#ff6ec7"
          >
            <div className="lp-feat-demo lp-demo-latency">
              <div className="lp-latency-bar">
                <span>Send</span>
                <div className="lp-latency-line">
                  <div className="lp-latency-pulse" />
                </div>
                <span className="lp-latency-ms">{'<300ms'}</span>
                <span>Deliver</span>
              </div>
              <div className="lp-latency-ticks">✓✓ read instantly</div>
            </div>
          </FeatureCard>
        </div>
      </section>

      {/* ══ LIVE DEMO ══════════════════════════════════════════════════════════ */}
      <section className="lp-demo-section" id="demo">
        <div className="lp-demo-left">
          <div className="lp-section-label">✦ See It In Action</div>
          <h2 className="lp-section-title" style={{ textAlign: 'left' }}>
            Watch the<br />
            <span className="lp-gradient-text">Whisper Stream</span><br />
            in Real Time
          </h2>
          <p className="lp-section-sub" style={{ textAlign: 'left' }}>
            Four people. One canvas. Zero lag. This is a live simulation
            of Krish, Tarun, Yash, and Nikhil yapping simultaneously —
            the real-time engine handles it all.
          </p>
          <button
            className="lp-cta-main lp-cta-sm"
            data-hover
            onClick={() => navigate('/signup')}
          >
            Try It Yourself →
          </button>
        </div>
        <WhisperDemo />
      </section>

      {/* ══ CTA BANNER ═════════════════════════════════════════════════════════ */}
      <section className="lp-cta-banner">
        <div className="lp-cta-banner-glow" />
        <h2 className="lp-cta-banner-title">
          Escape the Inbox.<br />
          <span className="lp-gradient-text">Enter the Spatial Canvas.</span>
        </h2>
        <p className="lp-cta-banner-sub">
          Join the beta. No credit card. No boring list.
        </p>
        <div className="lp-cta-banner-btns">
          <button className="lp-cta-main" data-hover onClick={() => navigate('/signup')}>
            Launch App Free →
          </button>
          <button className="lp-btn-ghost" data-hover onClick={() => navigate('/login')}>
            Sign In
          </button>
        </div>
      </section>

      {/* ══ FOOTER ═════════════════════════════════════════════════════════════ */}
      <footer className="lp-footer" id="footer">
        <div className="lp-footer-top">
          <div className="lp-footer-brand">
            <button className="lp-logo" onClick={() => navigate('/')}>
              <div className="lp-logo-mark">
                <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                  <defs>
                    <linearGradient id="logoGrad2" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#00e5ff"/>
                      <stop offset="100%" stopColor="#7b2fff"/>
                    </linearGradient>
                  </defs>
                  <rect width="32" height="32" rx="10" fill="url(#logoGrad2)" opacity="0.15"/>
                  <rect width="32" height="32" rx="10" stroke="url(#logoGrad2)" strokeWidth="1.5" fill="none"/>
                  <path d="M8 10 Q8 8 10 8 L22 8 Q24 8 24 10 L24 18 Q24 20 22 20 L14 20 L11 23 L11 20 L10 20 Q8 20 8 18 Z"
                    fill="url(#logoGrad2)" opacity="0.9"/>
                  <circle cx="13" cy="14" r="1.2" fill="white"/>
                  <circle cx="16" cy="14" r="1.2" fill="white"/>
                  <circle cx="19" cy="14" r="1.2" fill="white"/>
                </svg>
              </div>
              <span className="lp-logo-text">Yappers Zone</span>
            </button>
            <p className="lp-footer-tagline">
              The universe of chat is spatial.
            </p>
          </div>

          <div className="lp-footer-links-group">
            <span className="lp-footer-group-title">Product</span>
            <a href="#features" className="lp-footer-link">Features</a>
            <a href="#demo"     className="lp-footer-link">Live Demo</a>
            <button className="lp-footer-link lp-footer-btn" onClick={() => navigate('/signup')}>
              Get Started Free
            </button>
          </div>

          <div className="lp-footer-links-group">
            <span className="lp-footer-group-title">Dev</span>
            <a href="https://github.com" target="_blank" rel="noreferrer" className="lp-footer-link">GitHub</a>
            <a href="#" className="lp-footer-link">Portfolio</a>
            <a href="#" className="lp-footer-link">Contact</a>
          </div>

          <div className="lp-footer-links-group">
            <span className="lp-footer-group-title">Legal</span>
            <a href="#" className="lp-footer-link">Privacy Policy</a>
            <a href="#" className="lp-footer-link">Terms of Service</a>
          </div>
        </div>

        <div className="lp-footer-bottom">
          <span>© 2025 Yappers Zone. All rights reserved.</span>
          <button className="lp-btn-glow lp-btn-sm" data-hover onClick={() => navigate('/signup')}>
            Get Started Free
          </button>
        </div>
      </footer>
    </div>
  );
}
