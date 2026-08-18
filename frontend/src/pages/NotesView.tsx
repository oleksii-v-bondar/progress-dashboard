import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotes } from '../hooks/useNotes';
import type { Note } from '@shared/types';

function NoteCard({ note, onUpdate, onDelete }: {
  note: Note;
  onUpdate: (id: string, data: { content?: string; answered?: boolean }) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(note.content);

  const handleSave = () => {
    if (editContent.trim()) {
      onUpdate(note.id, { content: editContent.trim() });
      setEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
    if (e.key === 'Escape') { setEditContent(note.content); setEditing(false); }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      style={{
        padding: 16,
        background: 'var(--bg-secondary)',
        borderRadius: 8,
        border: `1px solid ${note.answered ? 'var(--success)40' : 'var(--border)'}`,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      <button
        onClick={() => onUpdate(note.id, { answered: !note.answered })}
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          border: `2px solid ${note.answered ? 'var(--success)' : 'var(--text-muted)'}`,
          background: note.answered ? 'var(--success)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 2,
          transition: 'all 0.2s',
        }}
      >
        {note.answered && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      <div style={{ flex: 1 }}>
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              style={{ fontSize: 15 }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={handleSave} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 4, background: 'var(--accent)' }}>Save</button>
              <button onClick={() => { setEditContent(note.content); setEditing(false); }} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 4, background: 'var(--bg-tertiary)' }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div
            onDoubleClick={() => setEditing(true)}
            style={{
              fontSize: 15,
              lineHeight: 1.5,
              opacity: note.answered ? 0.6 : 1,
              textDecoration: note.answered ? 'line-through' : 'none',
              transition: 'all 0.2s',
              cursor: 'text',
            }}
          >
            {note.content}
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
          {new Date(note.created_at).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            style={{ fontSize: 12, color: 'var(--text-muted)', opacity: 0.5, padding: 4 }}
          >
            &#9998;
          </button>
        )}
        <button
          onClick={() => onDelete(note.id)}
          style={{ fontSize: 16, color: 'var(--text-muted)', opacity: 0.5, padding: 4 }}
        >
          &times;
        </button>
      </div>
    </motion.div>
  );
}

export function NotesView() {
  const { notes, createNote, updateNote, deleteNote, loading } = useNotes();
  const [newContent, setNewContent] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'answered'>('all');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newContent.trim()) {
      await createNote(newContent.trim());
      setNewContent('');
    }
  };

  const filtered = notes.filter(note => {
    if (filter === 'open') return !note.answered;
    if (filter === 'answered') return note.answered;
    return true;
  });

  if (loading) {
    return <div style={{ color: 'var(--text-muted)' }}>Loading...</div>;
  }

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Notes & Questions</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
        Capture thoughts, questions to research later, or ideas to revisit.
      </p>

      <form onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            placeholder="Write a note or question..."
            style={{ flex: 1, fontSize: 14 }}
          />
          <button
            type="submit"
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              background: 'var(--accent)',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Add
          </button>
        </div>
      </form>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['all', 'open', 'answered'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: filter === f ? 600 : 400,
              background: filter === f ? 'var(--bg-tertiary)' : 'transparent',
              color: filter === f ? 'var(--text-primary)' : 'var(--text-muted)',
              border: '1px solid ' + (filter === f ? 'var(--border)' : 'transparent'),
            }}
          >
            {f === 'all' ? 'All' : f === 'open' ? 'Open' : 'Answered'}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <AnimatePresence>
          {filtered.map(note => (
            <NoteCard
              key={note.id}
              note={note}
              onUpdate={updateNote}
              onDelete={deleteNote}
            />
          ))}
        </AnimatePresence>

        {filtered.length === 0 && (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>
            {filter === 'all' ? 'No notes yet. Add one above.' :
             filter === 'open' ? 'No open questions. Nice!' :
             'No answered questions yet.'}
          </p>
        )}
      </div>
    </div>
  );
}
