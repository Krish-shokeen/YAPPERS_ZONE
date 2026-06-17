import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import styles from './ReactionPicker.module.css';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👏', '🚀', '👀'];

/**
 * ReactionPicker — a small glassmorphism floating picker for emojis.
 */
export default function ReactionPicker({ onSelect, onClose, isSent }) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <>
      {isMobile && (
        <div
          className={styles.backdrop}
          onClick={(e) => {
            e.stopPropagation();
            onClose?.();
          }}
        />
      )}
      <motion.div
        className={`${isMobile ? styles.mobileContainer : `${styles.container} ${isSent ? styles.sent : styles.received}`} glass-panel`}
        initial={isMobile ? { opacity: 0, scale: 0.85, x: '-50%', y: '-50%' } : { opacity: 0, scale: 0.85 }}
        animate={isMobile ? { opacity: 1, scale: 1, x: '-50%', y: '-50%' } : { opacity: 1, scale: 1 }}
        exit={isMobile ? { opacity: 0, scale: 0.85, x: '-50%', y: '-50%' } : { opacity: 0, scale: 0.85 }}
        transition={{ type: 'spring', damping: 20, stiffness: 350 }}
      >
        <div className={styles.grid}>
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              className={styles.emojiBtn}
              onClick={() => {
                onSelect(emoji);
                onClose?.();
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </motion.div>
    </>
  );
}
