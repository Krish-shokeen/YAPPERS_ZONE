import { AnimatePresence, motion } from 'framer-motion';
import styles from './TypingIndicator.module.css';

/**
 * TypingIndicator — shows who is currently typing.
 *
 * Requirements 6.6–6.8:
 *   - 1–3 users: show each display name
 *   - 4+ users: show "Several people are typing…"
 *   - Appears within 300ms, dismisses within 500ms
 */
export default function TypingIndicator({ typingUsers = [] }) {
  if (typingUsers.length === 0) return null;

  const text =
    typingUsers.length === 1
      ? `${typingUsers[0].displayName} is typing…`
      : typingUsers.length <= 3
      ? `${typingUsers.map((u) => u.displayName).join(', ')} are typing…`
      : 'Several people are typing…';

  return (
    <AnimatePresence>
      <motion.div
        className={styles.indicator}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.2 }}
      >
        <span className={styles.dots}>
          <span />
          <span />
          <span />
        </span>
        <span className={styles.text}>{text}</span>
      </motion.div>
    </AnimatePresence>
  );
}
