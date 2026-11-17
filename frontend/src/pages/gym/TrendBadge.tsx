import type { GymTrendLabel } from '@shared/types';

const MAP: Record<GymTrendLabel, { icon: string; text: string; color: string }> = {
  progressing: { icon: '▲', text: 'Progressing', color: 'var(--success)' },
  steady: { icon: '▬', text: 'Steady', color: 'var(--text-secondary)' },
  regressing: { icon: '▼', text: 'Regressing', color: 'var(--danger)' },
  insufficient: { icon: '•', text: 'Not enough data yet', color: 'var(--text-muted)' },
};

export function TrendBadge({ label }: { label: GymTrendLabel }) {
  const m = MAP[label];
  return <span style={{ color: m.color, fontWeight: 700 }}>{m.icon} {m.text}</span>;
}
