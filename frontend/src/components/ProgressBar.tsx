import { motion } from 'framer-motion';

interface ProgressBarProps {
  value: number; // 0-100
  color: string;
  label?: string;
  showPercentage?: boolean;
}

export function ProgressBar({ value, color, label, showPercentage = true }: ProgressBarProps) {
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div style={{ width: '100%' }}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
          {showPercentage && (
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{Math.round(clampedValue)}%</span>
          )}
        </div>
      )}
      <div
        style={{
          width: '100%',
          height: 8,
          background: 'var(--bg-tertiary)',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${clampedValue}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{
            height: '100%',
            background: `linear-gradient(90deg, ${color}, ${color}dd)`,
            borderRadius: 4,
            boxShadow: `0 0 10px ${color}80, 0 0 20px ${color}40`,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <motion.div
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
            }}
          />
        </motion.div>
      </div>
    </div>
  );
}
