import { motion } from 'framer-motion';
import styles from './ReactionPicker.module.css';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👏', '🚀', '👀'];

/**
 * ReactionPicker — a small glassmorphism floating picker for emojis.
 */
export default function ReactionPicker({ onSelect, onClose }) {
  return (
    <motion.div
      className={`${styles.container} glass-panel`}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
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
  );
}
