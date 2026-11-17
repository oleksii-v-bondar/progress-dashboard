import { GymNewPlanView } from './GymNewPlanView';
import { GymPlansView } from './GymPlansView';
import { GymPlanView } from './GymPlanView';
import { GymPlanEditorView } from './GymPlanEditorView';
import { GymSessionView } from './GymSessionView';
import { GymHistoryView } from './GymHistoryView';
import { GymSessionDetailView } from './GymSessionDetailView';
import { GymSessionEditView } from './GymSessionEditView';
import { GymProgressView } from './GymProgressView';
import { Navigate, parseGymView } from './nav';

export function GymRouter({ view, onNavigate }: { view: string; onNavigate: Navigate }) {
  const v = parseGymView(view);
  if (!v) return <div className="gym-muted">Page not found</div>;
  switch (v.page) {
    case 'plans':
      return <GymPlansView onNavigate={onNavigate} />;
    case 'new':
      return <GymNewPlanView onNavigate={onNavigate} />;
    case 'plan':
      return <GymPlanView planId={v.id} onNavigate={onNavigate} />;
    case 'edit':
      return <GymPlanEditorView planId={v.id} onNavigate={onNavigate} />;
    case 'session':
      return <GymSessionView dayId={v.dayId} onNavigate={onNavigate} />;
    case 'history':
      return <GymHistoryView onNavigate={onNavigate} />;
    case 'historyDetail':
      return <GymSessionDetailView sessionId={v.id} onNavigate={onNavigate} />;
    case 'historyEdit':
      return <GymSessionEditView sessionId={v.id} onNavigate={onNavigate} />;
    case 'progress':
      return <GymProgressView exerciseId={v.exerciseId} onNavigate={onNavigate} />;
    default:
      return <div className="gym-muted">Page not found</div>;
  }
}
