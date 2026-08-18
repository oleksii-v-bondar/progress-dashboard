import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';
import { TaskCard } from '../components/TaskCard';
import { useTasks } from '../hooks/useTasks';
import { api } from '../api/client';

interface WeekViewProps {
  onProgressChange: () => void;
}

export function WeekView({ onProgressChange }: WeekViewProps) {
  const { tasks, toggleComplete, updateTask, deleteTask, reorder, loading, refresh } = useTasks({ status: 'this_week' });

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

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    if (result.source.index === result.destination.index) return;
    reorder(result.source.index, result.destination.index);
  };

  if (loading) {
    return <div style={{ color: 'var(--text-muted)' }}>Loading...</div>;
  }

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>This Week</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
        Drag to reorder, or use buttons to move tasks.
      </p>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="week">
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              {tasks.length === 0 && (
                <p style={{ color: 'var(--text-muted)' }}>
                  No tasks scheduled this week. Move some from your backlog.
                </p>
              )}
              {tasks.map((task, index) => (
                <Draggable key={task.id} draggableId={task.id} index={index}>
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                    >
                      <TaskCard
                        {...task}
                        onToggleComplete={handleToggle}
                        onDelete={handleDelete}
                        onEdit={handleEdit}
                        moveActions={[
                          { label: 'Today', status: 'today' },
                          { label: 'Backlog', status: 'backlog' },
                        ]}
                        onMove={handleMove}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}
