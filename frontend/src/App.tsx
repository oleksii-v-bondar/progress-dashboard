import { useState, useCallback } from 'react';
import { Layout } from './components/Layout';
import { useAreas } from './hooks/useAreas';
import { useProgress } from './hooks/useProgress';
import { TodayView } from './pages/TodayView';
import { WeekView } from './pages/WeekView';
import { BacklogView } from './pages/BacklogView';
import { AreaDetailView } from './pages/AreaDetailView';
import { NotesView } from './pages/NotesView';
import { HistoryView } from './pages/HistoryView';
import { ArchivedView } from './pages/ArchivedView';
import { TodosView } from './pages/TodosView';

function App() {
  const [currentView, setCurrentView] = useState('today');
  const { areas, createArea, createSkill, deleteSkill } = useAreas();
  const progress = useProgress();

  const handleAreaSelect = (areaId: string) => {
    setCurrentView(`area-${areaId}`);
  };

  const refreshAll = useCallback(() => {
    progress.refresh();
  }, [progress]);

  const renderView = () => {
    switch (currentView) {
      case 'today':
        return <TodayView areaProgress={progress.areas} onProgressChange={refreshAll} />;
      case 'week':
        return <WeekView onProgressChange={refreshAll} />;
      case 'backlog':
        return <BacklogView areas={areas} onProgressChange={refreshAll} />;
      case 'todos':
        return <TodosView onProgressChange={refreshAll} />;
      case 'archived':
        return <ArchivedView onProgressChange={refreshAll} />;
      case 'notes':
        return <NotesView />;
      case 'history':
        return <HistoryView />;
      default: {
        if (currentView.startsWith('area-')) {
          const areaId = currentView.replace('area-', '');
          const area = areas.find(a => a.id === areaId);
          if (!area) return <div style={{ color: 'var(--text-muted)' }}>Area not found</div>;
          const areaProgressData = progress.areas.find(a => a.area_id === areaId);
          return (
            <AreaDetailView
              area={area}
              areaProgress={areaProgressData}
              onCreateSkill={createSkill}
              onDeleteSkill={deleteSkill}
              onProgressChange={refreshAll}
            />
          );
        }
        return null;
      }
    }
  };

  return (
    <Layout
      areas={areas}
      currentView={currentView}
      onViewChange={setCurrentView}
      onAreaSelect={handleAreaSelect}
      onCreateArea={createArea}
      progress={{ today: progress.today, week: progress.week }}
    >
      {renderView()}
    </Layout>
  );
}

export default App;
