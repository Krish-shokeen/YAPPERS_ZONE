import { useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../AuthContext';
import { useChat } from '../../ChatContext';
import { useChatSocket } from '../../hooks/useChatSocket';
import YappersHub from './YappersHub';
import '../../styles/cosmic-theme.css';

/* ── Cosmic cursor — portal rendered so it always stays on top ─────────────── */
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
  }, []);

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
      <CosmicCursor />
      <YappersHub
        chatJwt={chatJwt}
        chatSocket={chatSocket}
        currentUserId={userProfile?.id}
      />
    </>
  );
}
