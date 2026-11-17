import { GymNewPlanView } from './GymNewPlanView';
import { GymPlansView } from './GymPlansView';
import { Navigate, parseGymView } from './nav';

export function GymRouter({ view, onNavigate }: { view: string; onNavigate: Navigate }) {
  const v = parseGymView(view);
  if (!v) return <div className="gym-muted">Page not found</div>;
  switch (v.page) {
    case 'plans':
      return <GymPlansView onNavigate={onNavigate} />;
    case 'new':
      return <GymNewPlanView onNavigate={onNavigate} />;
    default:
      return <div className="gym-muted">Page not found</div>;
  }
}
