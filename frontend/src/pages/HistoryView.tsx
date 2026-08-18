import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { api } from '../api/client';
import type { AllTimeStats } from '@shared/types';

const LEARNING_COLOR = '#6366f1';
const TODO_COLOR = '#06b6d4';

interface WeekData {
  week_start: string;
  completed: number;
  learning: number;
  todos: number;
}

interface DailyData {
  day: string;
  completed: number;
  learning: number;
  todos: number;
}

export function HistoryView() {
  const [weeks, setWeeks] = useState<WeekData[]>([]);
  const [daily, setDaily] = useState<DailyData[]>([]);
  const [allTime, setAllTime] = useState<AllTimeStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getProgressHistory(), api.getAllTimeStats()]).then(([history, stats]) => {
      setWeeks(history.weeks);
      setDaily(history.daily);
      setAllTime(stats);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div style={{ color: 'var(--text-muted)' }}>Loading...</div>;
  }

  const maxWeekly = Math.max(...weeks.map(w => w.completed), 1);
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const formatWeek = (dateStr: string) => {
    const date = new Date(dateStr);
    const end = new Date(date);
    end.setDate(date.getDate() + 6);
    return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  };

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>History</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
        Your completion history over time.
      </p>

      {/* All-Time Stats */}
      {allTime && (
        <div style={{ marginBottom: 36 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)' }}>
            All-Time
          </h3>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Total Completions', value: allTime.total_completions },
              { label: 'Learning', value: allTime.learning_completions, color: LEARNING_COLOR },
              { label: 'Todos Done', value: allTime.todo_completions, color: TODO_COLOR },
              { label: 'Current Streak', value: `${allTime.current_streak}d`, highlight: allTime.current_streak > 0 },
              { label: 'Longest Streak', value: `${allTime.longest_streak}d` },
              { label: 'Tasks Created', value: allTime.tasks_created },
              { label: 'Todos Created', value: allTime.todos_created },
            ].map(stat => (
              <div
                key={stat.label}
                style={{
                  padding: '12px 16px',
                  background: 'var(--bg-secondary)',
                  border: `1px solid ${stat.color ? stat.color + '40' : 'var(--border)'}`,
                  borderRadius: 8,
                  minWidth: 110,
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 700, color: stat.color || (stat.highlight ? '#f59e0b' : 'var(--text-primary)') }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily this week */}
      {daily.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)' }}>
            This Week (daily)
          </h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 120 }}>
            {(() => {
              const maxDaily = Math.max(...daily.map(d => d.completed), 1);
              return dayNames.map((dayName, i) => {
                const dayData = daily.find(d => {
                  const date = new Date(d.day);
                  const dow = date.getDay();
                  return (dow === 0 ? 6 : dow - 1) === i;
                });
                const learningCount = dayData?.learning || 0;
                const todosCount = dayData?.todos || 0;
                const total = learningCount + todosCount;
              const totalHeight = total > 0 ? Math.max(20, (total / maxDaily) * 100) : 4;
              const learningHeight = total > 0 ? (learningCount / total) * totalHeight : totalHeight;
              const todosHeight = total > 0 ? (todosCount / total) * totalHeight : 0;

              return (
                <div key={dayName} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{total || ''}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 40, gap: 0 }}>
                    {total === 0 ? (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 4 }}
                        transition={{ duration: 0.5, delay: i * 0.05 }}
                        style={{ width: '100%', background: 'var(--bg-tertiary)', borderRadius: 4 }}
                      />
                    ) : (
                      <>
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: todosHeight }}
                          transition={{ duration: 0.5, delay: i * 0.05 }}
                          style={{ width: '100%', background: TODO_COLOR, borderRadius: '4px 4px 0 0', boxShadow: `0 0 8px ${TODO_COLOR}40` }}
                        />
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: learningHeight }}
                          transition={{ duration: 0.5, delay: i * 0.05 + 0.05 }}
                          style={{ width: '100%', background: LEARNING_COLOR, borderRadius: todosHeight > 0 ? '0 0 4px 4px' : 4, boxShadow: `0 0 8px ${LEARNING_COLOR}40` }}
                        />
                      </>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{dayName}</span>
                </div>
              );
              });
            })()}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <span style={{ fontSize: 11, color: LEARNING_COLOR }}>● Learning</span>
            <span style={{ fontSize: 11, color: TODO_COLOR }}>● Todos</span>
          </div>
        </div>
      )}

      {/* Weekly summary */}
      <div>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)' }}>
          Weekly Summary
        </h3>
        {weeks.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No history yet. Complete some tasks to see your progress over time.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {weeks.map((week, i) => {
              const learningPct = (week.learning / maxWeekly) * 100;
              const todosPct = (week.todos / maxWeekly) * 100;
              const totalPct = learningPct + todosPct;
              return (
                <div key={week.week_start} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', width: 140, flexShrink: 0 }}>
                    {formatWeek(week.week_start)}
                  </span>
                  <div style={{ flex: 1, height: 24, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${learningPct}%` }}
                      transition={{ duration: 0.6, delay: i * 0.05 }}
                      style={{
                        height: '100%',
                        background: LEARNING_COLOR,
                        boxShadow: `0 0 8px ${LEARNING_COLOR}60`,
                        display: 'flex',
                        alignItems: 'center',
                        paddingLeft: 8,
                      }}
                    >
                      {learningPct > 10 && (
                        <span style={{ fontSize: 11, fontWeight: 600 }}>{week.learning}</span>
                      )}
                    </motion.div>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${todosPct}%` }}
                      transition={{ duration: 0.6, delay: i * 0.05 + 0.1 }}
                      style={{
                        height: '100%',
                        background: TODO_COLOR,
                        boxShadow: `0 0 8px ${TODO_COLOR}60`,
                        display: 'flex',
                        alignItems: 'center',
                        paddingLeft: learningPct > 0 ? 4 : 8,
                      }}
                    >
                      {todosPct > 10 && (
                        <span style={{ fontSize: 11, fontWeight: 600 }}>{week.todos}</span>
                      )}
                    </motion.div>
                  </div>
                  {totalPct <= 10 && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 24 }}>{week.completed}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <span style={{ fontSize: 11, color: LEARNING_COLOR }}>● Learning</span>
          <span style={{ fontSize: 11, color: TODO_COLOR }}>● Todos</span>
        </div>
      </div>
    </div>
  );
}
