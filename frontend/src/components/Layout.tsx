import { ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';
import { ProgressOverview } from './ProgressOverview';

interface LayoutProps {
  children: ReactNode;
  areas: Array<{ id: string; name: string; color: string }>;
  currentView: string;
  onViewChange: (view: string) => void;
  onAreaSelect: (areaId: string) => void;
  onCreateArea: (name: string, color: string) => void;
  progress: {
    today: { completed: number; total: number; learning: number; todos: number };
    week: { completed: number; total: number; learning: number; todos: number };
  };
}

export function Layout({ children, areas, currentView, onViewChange, onAreaSelect, onCreateArea, progress }: LayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleNav = (view: string) => {
    onViewChange(view);
    setMenuOpen(false);
  };

  const handleAreaNav = (areaId: string) => {
    onAreaSelect(areaId);
    setMenuOpen(false);
  };

  return (
    <div className="layout">
      {/* Mobile header */}
      <header className="mobile-header">
        <button className="menu-toggle" onClick={() => setMenuOpen(true)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <span className="mobile-title">Progress</span>
      </header>

      {/* Overlay */}
      {menuOpen && <div className="sidebar-overlay" onClick={() => setMenuOpen(false)} />}

      {/* Sidebar */}
      <aside className={`sidebar ${menuOpen ? 'sidebar--open' : ''}`}>
        <Sidebar
          areas={areas}
          currentView={currentView}
          onViewChange={handleNav}
          onAreaSelect={handleAreaNav}
          onCreateArea={onCreateArea}
        />
      </aside>

      {/* Main content */}
      <div className="main-content">
        <ProgressOverview today={progress.today} week={progress.week} />
        <main className="main-body">
          {children}
        </main>
      </div>
    </div>
  );
}
