import { useState } from 'react';
import { motion } from 'framer-motion';

interface MoveAction {
  label: string;
  status: string;
}

interface TaskCardProps {
  id: string;
  name: string;
  description: string | null;
  skill_name: string;
  area_name: string;
  area_color: string;
  completed_today: boolean;
  onToggleComplete: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  onEdit?: (id: string, data: { name: string; description?: string }) => void;
  moveActions?: MoveAction[];
  onMove?: (id: string, status: string) => void;
}

export function TaskCard({
  id,
  name,
  description,
  skill_name,
  area_name,
  area_color,
  completed_today,
  onToggleComplete,
  onDelete,
  onEdit,
  moveActions,
  onMove,
}: TaskCardProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const [editDesc, setEditDesc] = useState(description || '');

  const handleSave = () => {
    if (editName.trim() && onEdit) {
      onEdit(id, { name: editName.trim(), description: editDesc.trim() || undefined });
      setEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setEditName(name);
      setEditDesc(description || '');
      setEditing(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: 16,
        background: 'var(--bg-secondary)',
        borderRadius: 8,
        border: `1px solid ${completed_today ? area_color + '40' : 'var(--border)'}`,
        transition: 'border-color 0.2s',
      }}
    >
      <button
        onClick={() => onToggleComplete(id, completed_today)}
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          border: `2px solid ${completed_today ? area_color : 'var(--text-muted)'}`,
          background: completed_today ? area_color : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 2,
          transition: 'all 0.2s',
        }}
      >
        {completed_today && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      <div style={{ flex: 1 }}>
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              style={{ fontSize: 15, fontWeight: 500 }}
            />
            <input
              value={editDesc}
              onChange={e => setEditDesc(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Description (optional)"
              style={{ fontSize: 13 }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={handleSave}
                style={{ fontSize: 12, padding: '4px 10px', borderRadius: 4, background: 'var(--accent)' }}
              >
                Save
              </button>
              <button
                onClick={() => { setEditName(name); setEditDesc(description || ''); setEditing(false); }}
                style={{ fontSize: 12, padding: '4px 10px', borderRadius: 4, background: 'var(--bg-tertiary)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              onDoubleClick={() => onEdit && setEditing(true)}
              style={{
                fontSize: 15,
                fontWeight: 500,
                textDecoration: completed_today ? 'line-through' : 'none',
                opacity: completed_today ? 0.6 : 1,
                transition: 'all 0.2s',
                cursor: onEdit ? 'text' : 'default',
              }}
            >
              {name}
            </div>
            {description && (
              <div
                onDoubleClick={() => onEdit && setEditing(true)}
                style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, cursor: onEdit ? 'text' : 'default' }}
              >
                {description}
              </div>
            )}
          </>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <span
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 12,
              background: area_color + '20',
              color: area_color,
              fontWeight: 500,
            }}
          >
            {area_name}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {skill_name}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
        {onEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            style={{ fontSize: 12, color: 'var(--text-muted)', opacity: 0.5, padding: 4 }}
          >
            &#9998;
          </button>
        )}
        {moveActions && onMove && moveActions.map(action => (
          <button
            key={action.status}
            onClick={() => onMove(id, action.status)}
            style={{
              fontSize: 11,
              padding: '4px 8px',
              borderRadius: 4,
              background: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
            }}
          >
            {action.label}
          </button>
        ))}
        <button
          onClick={() => onDelete(id)}
          style={{
            fontSize: 16,
            color: 'var(--text-muted)',
            opacity: 0.5,
            padding: 4,
          }}
        >
          &times;
        </button>
      </div>
    </motion.div>
  );
}
