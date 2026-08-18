import { useState, useEffect } from 'react';
import { TaskCard } from '../components/TaskCard';
import { useTasks } from '../hooks/useTasks';
import { api } from '../api/client';
import type { Todo } from '@shared/types';

const TODO_COLOR = '#06b6d4';

interface ArchivedViewProps {
  onProgressChange: () => void;
}

export function ArchivedView({ onProgressChange }: ArchivedViewProps) {
  const { tasks, deleteTask, loading, refresh } = useTasks({ status: 'archived' });
  const [completedTodos, setCompletedTodos] = useState<Todo[]>([]);
  const [todosLoading, setTodosLoading] = useState(true);

  const fetchCompletedTodos = async () => {
    setTodosLoading(true);
    const data = await api.getCompletedTodos();
    setCompletedTodos(data);
    setTodosLoading(false);
  };

  useEffect(() => { fetchCompletedTodos(); }, []);

  const handleDelete = async (id: string) => {
    await deleteTask(id);
    onProgressChange();
  };

  const handleMove = async (id: string, status: string) => {
    await api.moveTask(id, status);
    await refresh();
    onProgressChange();
  };

  const handleDeleteTodo = async (id: string) => {
    await api.deleteTodo(id);
    await fetchCompletedTodos();
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  if (loading || todosLoading) {
    return <div style={{ color: 'var(--text-muted)' }}>Loading...</div>;
  }

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Archived</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
        Completed tasks and todos.
      </p>

      {/* Learning tasks */}
      {tasks.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Learning Tasks
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tasks.map(task => (
              <TaskCard
                key={task.id}
                {...task}
                onToggleComplete={() => {}}
                onDelete={handleDelete}
                moveActions={[
                  { label: 'Today', status: 'today' },
                  { label: 'Backlog', status: 'backlog' },
                ]}
                onMove={handleMove}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed todos */}
      {completedTodos.length > 0 && (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Todos
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {completedTodos.map(todo => (
              <div
                key={todo.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  opacity: 0.7,
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    border: `2px solid ${TODO_COLOR}`,
                    background: TODO_COLOR,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    color: '#fff',
                  }}
                >
                  ✓
                </div>
                <span style={{ flex: 1, fontSize: 14, textDecoration: 'line-through', color: 'var(--text-muted)' }}>
                  {todo.title}
                </span>
                {todo.completed_at && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {formatDate(todo.completed_at)}
                  </span>
                )}
                <button
                  onClick={() => handleDeleteTodo(todo.id)}
                  style={{ color: 'var(--text-muted)', fontSize: 14, padding: '2px 4px' }}
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tasks.length === 0 && completedTodos.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>
          Nothing archived yet. Completed tasks and todos appear here.
        </p>
      )}
    </div>
  );
}
