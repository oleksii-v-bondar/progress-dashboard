import { useState } from 'react';

interface SidebarProps {
  areas: Array<{ id: string; name: string; color: string }>;
  currentView: string;
  onViewChange: (view: string) => void;
  onAreaSelect: (areaId: string) => void;
  onCreateArea: (name: string, color: string) => void;
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4'];

export function Sidebar({ areas, currentView, onViewChange, onAreaSelect, onCreateArea }: SidebarProps) {
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      onCreateArea(newName.trim(), newColor);
      setNewName('');
      setShowForm(false);
    }
  };

  const navItems = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'This Week' },
    { id: 'backlog', label: 'Backlog' },
    { id: 'todos', label: 'Todos' },
    { id: 'archived', label: 'Archived' },
    { id: 'notes', label: 'Notes' },
    { id: 'history', label: 'History' },
  ];

  return (
    <aside
      style={{
        width: 240,
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
        padding: '20px 0',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
      }}
    >
      <div style={{ padding: '0 16px', marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>Progress</h1>
      </div>

      <nav style={{ padding: '0 8px', marginBottom: 24 }}>
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '10px 12px',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: currentView === item.id ? 600 : 400,
              background: currentView === item.id ? 'var(--bg-tertiary)' : 'transparent',
              color: currentView === item.id ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div style={{ padding: '0 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Areas
          </span>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{ fontSize: 18, color: 'var(--text-muted)', lineHeight: 1 }}
          >
            +
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} style={{ marginBottom: 12 }}>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Area name"
              autoFocus
              style={{ width: '100%', marginBottom: 8, fontSize: 13 }}
            />
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: c,
                    border: newColor === c ? '2px solid white' : '2px solid transparent',
                  }}
                />
              ))}
            </div>
            <button
              type="submit"
              style={{
                width: '100%',
                padding: '6px',
                borderRadius: 6,
                background: 'var(--accent)',
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              Add Area
            </button>
          </form>
        )}

        {areas.map(area => (
          <button
            key={area.id}
            onClick={() => onAreaSelect(area.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              textAlign: 'left',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 14,
              color: 'var(--text-secondary)',
              background: currentView === `area-${area.id}` ? 'var(--bg-tertiary)' : 'transparent',
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: area.color }} />
            {area.name}
          </button>
        ))}
      </div>
    </aside>
  );
}
