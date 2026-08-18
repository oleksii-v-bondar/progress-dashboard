import { motion } from 'framer-motion';

const LEARNING_COLOR = '#6366f1';
const TODO_COLOR = '#06b6d4';

interface SegmentedBarProps {
  label: string;
  completed: number;
  total: number;
  learning: number;
  todos: number;
}

function SegmentedBar({ label, completed, total, learning, todos }: SegmentedBarProps) {
  const learningPct = total > 0 ? (learning / total) * 100 : 0;
  const todosPct = total > 0 ? (todos / total) * 100 : 0;

  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {label}: {completed}/{total}
        </span>
      </div>
      <div style={{ width: '100%', height: 8, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${learningPct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{
            height: '100%',
            background: LEARNING_COLOR,
            boxShadow: `0 0 10px ${LEARNING_COLOR}80`,
          }}
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${todosPct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
          style={{
            height: '100%',
            background: TODO_COLOR,
            boxShadow: `0 0 10px ${TODO_COLOR}80`,
          }}
        />
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
        <span style={{ fontSize: 11, color: LEARNING_COLOR }}>● Learning: {learning}</span>
        <span style={{ fontSize: 11, color: TODO_COLOR }}>● Todos: {todos}</span>
      </div>
    </div>
  );
}

interface ProgressOverviewProps {
  today: { completed: number; total: number; learning: number; todos: number };
  week: { completed: number; total: number; learning: number; todos: number };
}

export function ProgressOverview({ today, week }: ProgressOverviewProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 32,
        padding: '16px 24px',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <SegmentedBar
        label="Today"
        completed={today.completed}
        total={today.total}
        learning={today.learning}
        todos={today.todos}
      />
      <SegmentedBar
        label="This Week"
        completed={week.completed}
        total={week.total}
        learning={week.learning}
        todos={week.todos}
      />
    </div>
  );
}
