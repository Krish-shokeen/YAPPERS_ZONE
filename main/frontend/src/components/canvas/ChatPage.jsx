import { useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../AuthContext';
import { useChat } from '../../ChatContext';
import { useChatSocket } from '../../hooks/useChatSocket';
import YappersHub from './YappersHub';
import '../../styles/cosmic-theme.css';

/* ── Animated star + nebula canvas — matches landing page exactly ─────────── */
function CosmicBackground() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    const stars = Array.from({ length: 220 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.3 + 0.2,
      a: Math.random(),
      s: Math.random() * 0.004 + 0.001,
    }));

    const orbs = [
      { x: 0.15, y: 0.25, r: 260, c: 'rgba(0,229,255,0.055)', angle: 0, sp: 0.0005 },
      { x: 0.80, y: 0.60, r: 320, c: 'rgba(123,47,255,0.06)',  angle: 2, sp: -0.0003 },
      { x: 0.50, y: 0.85, r: 200, c: 'rgba(255,110,199,0.04)', angle: 4, sp: 0.0004 },
    ];

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Base deep background
      const bg = ctx.createLinearGradient(0, 0, canvas.width * 0.3, canvas.height);
      bg.addColorStop(0, '#060810');
      bg.addColorStop(0.5, '#06090f');
      bg.addColorStop(1, '#060810');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Animated nebula orbs
      orbs.forEach((o) => {
        o.angle += o.sp;
        const x = canvas.width  * o.x + Math.sin(o.angle * 0.7) * 60;
        const y = canvas.height * o.y + Math.cos(o.angle * 0.5) * 40;
        const g = ctx.createRadialGradient(x, y, 0, x, y, o.r);
        g.addColorStop(0, o.c);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, o.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // Stars with twinkle
      stars.forEach((s) => {
        s.a += s.s;
        if (s.a > 1 || s.a < 0) s.s *= -1;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${s.a * 0.65})`;
        ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return (
    <canvas
      ref={ref}
      style={{
        position: 'fixed', inset: 0,
        width: '100vw', height: '100vh',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}

/* ── Cosmic cursor — desktop only, hidden on touch devices ─────────────────── */
function CosmicCursor() {
  const dotRef  = useRef(null);
  const ringRef = useRef(null);
  const pos     = useRef({ x: -100, y: -100 });
  const ring    = useRef({ x: -100, y: -100 });

  // Don't render on touch devices (mobile/tablet)
  const isTouchDevice = typeof window !== 'undefined' &&
    (window.matchMedia('(hover: none)').matches || 'ontouchstart' in window);

  useEffect(() => {
    if (isTouchDevice) return;

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
      if (e.target.closest('button, a, input, textarea, [data-hover]')) {
        dotRef.current?.classList.add('chat-cursor-hover');
        ringRef.current?.classList.add('chat-cursor-hover');
      }
    };
    const onLeave = (e) => {
      if (e.target.closest('button, a, input, textarea, [data-hover]')) {
        dotRef.current?.classList.remove('chat-cursor-hover');
        ringRef.current?.classList.remove('chat-cursor-hover');
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
  }, [isTouchDevice]);

  if (isTouchDevice) return null;

  return createPortal(
    <>
      <div ref={dotRef}  className="chat-cursor-dot"  />
      <div ref={ringRef} className="chat-cursor-ring" />
    </>,
    document.body
  );
}


export default function ChatPage() {
  const navigate = useNavigate();
  const { user, userProfile, loading } = useAuth();
  const { chatJwt, chatJwtLoading } = useChat();

  const chatSocket = useChatSocket({
    chatJwt,
    onToast: (msg) => console.warn('[Toast]', msg),
  });

  if (loading || chatJwtLoading) {
    return (
      <div style={{
        width: '100vw', height: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0a0e1a', color: '#00e5ff', fontSize: 14,
        cursor: 'none',
      }}>
        <CosmicCursor />
        Connecting to Yappers Zone…
      </div>
    );
  }

  if (!user) {
    navigate('/login');
    return null;
  }

  return (
    <>
      <CosmicBackground />
      <CosmicCursor />
      <YappersHub
        chatJwt={chatJwt}
        chatSocket={chatSocket}
        currentUserId={userProfile?.id || userProfile?._id}
      />
    </>
  );
}
