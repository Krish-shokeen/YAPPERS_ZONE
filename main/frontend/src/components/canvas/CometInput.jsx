import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import styles from './CometInput.module.css';

const COMET_OFFSET_PX = 72;

/**
 * CometInput — floating input docked below selected node.
 *
 * Requirements 12.6, Property 43:
 *   - Semi-transparent floating input panel
 *   - Recalculates position every frame (or via parent props update)
 *   - Position = (nodeX, nodeY + 72)
 *   - Trailing light effect elements visible during movement
 *   - On submit, emits sendDm / sendChannelMessage, clears input
 */
export default function CometInput({ activeNode, nodePosition, onSend }) {
  const [text, setText] = useState('');

  if (!activeNode || !nodePosition) return null;

  const x = nodePosition.x;
  const y = nodePosition.y + COMET_OFFSET_PX;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend?.(activeNode, text.trim());
    setText('');
  };

  return (
    <div
      className={styles.cometWrapper}
      style={{
        transform: `translate(${x}px, ${y}px)`,
        left: 0,
        top: 0,
      }}
    >
      {/* Trailing light particles */}
      <div className={styles.trails}>
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className={styles.trailParticle}
            animate={{
              x: [0, (Math.random() - 0.5) * 40],
              y: [-10, -40 - i * 15],
              scale: [1, 0],
              opacity: [0.8, 0],
            }}
            transition={{
              duration: 0.8 + i * 0.2,
              repeat: Infinity,
              ease: 'easeOut',
            }}
          />
        ))}
      </div>

      <form className={`${styles.inputBox} glass-panel`} onSubmit={handleSubmit}>
        <textarea
          className={styles.textarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Yap to ${activeNode.name}...`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />
        <button type="submit" className={styles.sendBtn} disabled={!text.trim()}>
          ➤
        </button>
      </form>
    </div>
  );
}
