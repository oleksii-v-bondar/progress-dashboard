import { GymNewPlanView } from './GymNewPlanView';
import { GymPlansView } from './GymPlansView';
import { GymPlanView } from './GymPlanView';
import { GymPlanEditorView } from './GymPlanEditorView';
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
    default:
      return <div className="gym-muted">Page not found</div>;
  }
}
