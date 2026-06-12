import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import './AuthLayout.css';

/* ── Custom cursor (same as landing page) ────────────────────────────────── */
function CosmicCursor() {
  const dotRef  = useRef(null);
  const ringRef = useRef(null);
  const pos     = useRef({ x: -100, y: -100 });
  const ring    = useRef({ x: -100, y: -100 });

  useEffect(() => {
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

    const onEnter = (e) => {
      if (e.target.closest('button, a, input, textarea')) {
        dotRef.current?.classList.add('ac-cursor-hover');
        ringRef.current?.classList.add('ac-cursor-hover');
      }
    };
    const onLeave = (e) => {
      if (e.target.closest('button, a, input, textarea')) {
        dotRef.current?.classList.remove('ac-cursor-hover');
        ringRef.current?.classList.remove('ac-cursor-hover');
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
      <div ref={dotRef}  className="ac-cursor-dot"  />
      <div ref={ringRef} className="ac-cursor-ring" />
    </>,
    document.body
  );
}

/* ── Star canvas ──────────────────────────────────────────────────────────── */
function StarBg() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const stars = Array.from({ length: 160 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.2 + 0.2,
      a: Math.random(),
      s: Math.random() * 0.004 + 0.001,
    }));

    let angle = 0;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      angle += 0.002;

      // Soft nebula glow
      const gx = canvas.width * 0.3 + Math.sin(angle) * 60;
      const gy = canvas.height * 0.4 + Math.cos(angle * 0.7) * 40;
      const g  = ctx.createRadialGradient(gx, gy, 0, gx, gy, 280);
      g.addColorStop(0, 'rgba(0,229,255,0.05)');
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(gx, gy, 280, 0, Math.PI * 2);
      ctx.fill();

      stars.forEach((s) => {
        s.a += s.s;
        if (s.a > 1 || s.a < 0) s.s *= -1;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${s.a * 0.6})`;
        ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} className="ac-star-canvas" />;
}

/* ── Logo SVG ─────────────────────────────────────────────────────────────── */
export function LogoMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="alg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00e5ff"/>
          <stop offset="100%" stopColor="#7b2fff"/>
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="10" fill="url(#alg)" opacity="0.15"/>
      <rect width="32" height="32" rx="10" stroke="url(#alg)" strokeWidth="1.5" fill="none"/>
      <path
        d="M8 10 Q8 8 10 8 L22 8 Q24 8 24 10 L24 18 Q24 20 22 20 L14 20 L11 23 L11 20 L10 20 Q8 20 8 18 Z"
        fill="url(#alg)" opacity="0.9"
      />
      <circle cx="13" cy="14" r="1.2" fill="white"/>
      <circle cx="16" cy="14" r="1.2" fill="white"/>
      <circle cx="19" cy="14" r="1.2" fill="white"/>
    </svg>
  );
}

/* ── AuthLayout ───────────────────────────────────────────────────────────── */
export default function AuthLayout({ children, title, subtitle }) {
  const navigate = useNavigate();

  return (
    <div className="ac-root">
      <CosmicCursor />
      <StarBg />

      {/* Nebula blobs */}
      <div className="ac-blob ac-blob-1" />
      <div className="ac-blob ac-blob-2" />

      {/* Navbar */}
      <nav className="ac-nav">
        <button className="ac-logo" onClick={() => navigate('/')}>
          <div className="ac-logo-mark">
            <LogoMark size={30} />
          </div>
          <span className="ac-logo-text">Yappers Zone</span>
        </button>
      </nav>

      {/* Card */}
      <main className="ac-main">
        <div className="ac-card">
          {/* Card glow border */}
          <div className="ac-card-glow" />

          {/* Header */}
          <div className="ac-card-header">
            <LogoMark size={40} />
            <h1 className="ac-title">{title}</h1>
            {subtitle && <p className="ac-subtitle">{subtitle}</p>}
          </div>

          {children}
        </div>
      </main>
    </div>
  );
}
