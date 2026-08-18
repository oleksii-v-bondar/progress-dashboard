import { AnimatePresence } from 'framer-motion';
import { TaskCard } from '../components/TaskCard';
import { ProgressBar } from '../components/ProgressBar';
import { useTasks } from '../hooks/useTasks';
import { api } from '../api/client';

interface TodayViewProps {
  areaProgress: Array<{ area_id: string; area_name: string; color: string; completed: number; total: number }>;
  onProgressChange: () => void;
}

export function TodayView({ areaProgress, onProgressChange }: TodayViewProps) {
  const { tasks, toggleComplete, updateTask, deleteTask, loading, refresh } = useTasks({ status: 'today' });

  const handleToggle = async (id: string, completed: boolean) => {
    await toggleComplete(id, completed);
    onProgressChange();
  };

  const handleDelete = async (id: string) => {
    await deleteTask(id);
    onProgressChange();
  };

  const handleEdit = async (id: string, data: { name: string; description?: string }) => {
    await updateTask(id, data);
  };

  const handleMove = async (id: string, status: string) => {
    await api.moveTask(id, status);
    await refresh();
    onProgressChange();
  };

  if (loading) {
    return <div style={{ color: 'var(--text-muted)' }}>Loading...</div>;
  }

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 20 }}>Today</h2>

      {tasks.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>
          No tasks for today. Move some from your backlog or weekly plan.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
          <AnimatePresence>
            {tasks.map(task => (
              <TaskCard
                key={task.id}
                {...task}
                onToggleComplete={handleToggle}
                onDelete={handleDelete}
                onEdit={handleEdit}
                moveActions={[
                  { label: 'Week', status: 'this_week' },
                  { label: 'Backlog', status: 'backlog' },
                ]}
                onMove={handleMove}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {areaProgress.length > 0 && (
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)' }}>
            Area Progress
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {areaProgress.filter(a => a.total > 0).map(area => (
              <ProgressBar
                key={area.area_id}
                value={area.total > 0 ? (area.completed / area.total) * 100 : 0}
                color={area.color}
                label={`${area.area_name}: ${area.completed}/${area.total}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
