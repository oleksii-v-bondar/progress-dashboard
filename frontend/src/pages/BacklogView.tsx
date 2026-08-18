import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';
import { TaskCard } from '../components/TaskCard';
import { AddTaskForm } from '../components/AddTaskForm';
import { useTasks } from '../hooks/useTasks';
import { api } from '../api/client';

interface BacklogViewProps {
  areas: Array<{ id: string; name: string; color: string; skills: Array<{ id: string; name: string }> }>;
  onProgressChange: () => void;
}

export function BacklogView({ areas, onProgressChange }: BacklogViewProps) {
  const { tasks, createTask, updateTask, deleteTask, reorder, loading, refresh } = useTasks({ status: 'backlog' });

  const handleCreateTask = async (data: { skill_id: string; name: string; description?: string; status: string }) => {
    await createTask(data);
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
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Backlog</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
        Your pool of tasks. Drag to reorder, or use buttons to move.
      </p>

      <div style={{ marginBottom: 20 }}>
        <AddTaskForm areas={areas} defaultStatus="backlog" onAdd={handleCreateTask} />
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="backlog">
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
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
                        onToggleComplete={() => {}}
                        onDelete={handleDelete}
                        onEdit={handleEdit}
                        moveActions={[
                          { label: 'Week', status: 'this_week' },
                          { label: 'Today', status: 'today' },
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
