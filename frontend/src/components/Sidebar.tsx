import { useState } from 'react';
import { gymNavSection, gymViews } from '../pages/gym/nav';

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

  const navButtonStyle = (active: boolean): React.CSSProperties => ({
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '10px 12px',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: active ? 600 : 400,
    background: active ? 'var(--bg-tertiary)' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
  });

  const gymItems = [
    { id: gymViews.plans, label: 'Plans' },
    { id: gymViews.newPlan, label: 'New plan' },
    { id: gymViews.history, label: 'History' },
  ];
  const gymActive = gymNavSection(currentView);

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
    <div className="sidebar-inner">
      <div style={{ padding: '0 16px', marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>Progress</h1>
      </div>

      <nav style={{ padding: '0 8px', marginBottom: 24 }}>
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className="nav-item"
            style={navButtonStyle(currentView === item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div style={{ padding: '0 16px', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          Gym
        </span>
      </div>
      <nav style={{ padding: '0 8px', marginBottom: 24 }}>
        {gymItems.map(item => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className="nav-item"
            style={navButtonStyle(gymActive === item.id)}
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
                    width: 24,
                    height: 24,
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
                padding: '8px',
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
            className="nav-item"
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
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: area.color, flexShrink: 0 }} />
            {area.name}
          </button>
        ))}
      </div>
    </div>
  );
}
