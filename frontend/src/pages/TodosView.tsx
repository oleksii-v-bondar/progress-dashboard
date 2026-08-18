import { useState } from 'react';
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';
import { useTodos } from '../hooks/useTodos';

const TODO_COLOR = '#06b6d4';

interface TodosViewProps {
  onProgressChange: () => void;
}

export function TodosView({ onProgressChange }: TodosViewProps) {
  const { todos, createTodo, updateTodo, deleteTodo, completeTodo, reorder, loading } = useTodos();
  const [newTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await createTodo(newTitle.trim());
    setNewTitle('');
    onProgressChange();
  };

  const handleComplete = async (id: string) => {
    await completeTodo(id);
    onProgressChange();
  };

  const handleDelete = async (id: string) => {
    await deleteTodo(id);
    onProgressChange();
  };

  const startEdit = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditValue(currentTitle);
  };

  const saveEdit = async (id: string) => {
    if (editValue.trim() && editValue.trim() !== todos.find(t => t.id === id)?.title) {
      await updateTodo(id, editValue.trim());
    }
    setEditingId(null);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') saveEdit(id);
    if (e.key === 'Escape') setEditingId(null);
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
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Todos</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
        Simple tasks not tied to any learning area.
      </p>

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          placeholder="Add a todo..."
          style={{ flex: 1, fontSize: 14 }}
        />
        <button
          type="submit"
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            background: TODO_COLOR,
            color: '#fff',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Add
        </button>
      </form>

      {todos.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>No todos. Add something above.</p>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="todos">
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              {todos.map((todo, index) => (
                <Draggable key={todo.id} draggableId={todo.id} index={index}>
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      style={{
                        ...provided.draggableProps.style,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 14px',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                      }}
                    >
                      {/* Cyan checkbox */}
                      <button
                        onClick={() => handleComplete(todo.id)}
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          border: `2px solid ${TODO_COLOR}`,
                          background: 'transparent',
                          flexShrink: 0,
                          cursor: 'pointer',
                        }}
                        title="Mark done"
                      />

                      {/* Title (editable) */}
                      <div style={{ flex: 1 }}>
                        {editingId === todo.id ? (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => saveEdit(todo.id)}
                            onKeyDown={e => handleEditKeyDown(e, todo.id)}
                            style={{ width: '100%', fontSize: 14 }}
                          />
                        ) : (
                          <span
                            onDoubleClick={() => startEdit(todo.id, todo.title)}
                            style={{ fontSize: 14, color: 'var(--text-primary)', cursor: 'text' }}
                          >
                            {todo.title}
                          </span>
                        )}
                      </div>

                      {/* Edit button */}
                      <button
                        onClick={() => startEdit(todo.id, todo.title)}
                        style={{ color: 'var(--text-muted)', fontSize: 14, padding: '2px 4px' }}
                        title="Edit"
                      >
                        ✏
                      </button>

                      {/* Delete button */}
                      <button
                        onClick={() => handleDelete(todo.id)}
                        style={{ color: 'var(--text-muted)', fontSize: 14, padding: '2px 4px' }}
                        title="Delete"
                      >
                        ✕
                      </button>
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
