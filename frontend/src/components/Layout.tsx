import { ReactNode } from 'react';
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
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
        areas={areas}
        currentView={currentView}
        onViewChange={onViewChange}
        onAreaSelect={onAreaSelect}
        onCreateArea={onCreateArea}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <ProgressOverview today={progress.today} week={progress.week} />
        <main style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
