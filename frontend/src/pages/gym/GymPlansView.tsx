import { api } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { InProgressBanner } from './InProgressBanner';
import { gymViews, Navigate } from './nav';

export function GymPlansView({ onNavigate }: { onNavigate: Navigate }) {
  const { data: plans, loading, error } = useAsync(() => api.gymPlans(), []);

  return (
    <div className="gym-page">
      <div className="gym-row gym-row--between">
        <h2 className="gym-title">Gym plans</h2>
        <button className="gym-btn" onClick={() => onNavigate(gymViews.newPlan)}>+ New plan</button>
      </div>
      <InProgressBanner onNavigate={onNavigate} />
      {error && <div className="gym-error">{error}</div>}
      {loading && !plans && <div className="gym-muted">Loading…</div>}
      {plans && plans.length === 0 && (
        <div className="gym-card">
          <div className="gym-muted">No plans yet. Create one from scratch or import a JSON plan.</div>
          <button className="gym-btn" onClick={() => onNavigate(gymViews.newPlan)}>Create or import a plan</button>
        </div>
      )}
      {plans?.map((p) => (
        <button key={p.id} className="gym-list-row" onClick={() => onNavigate(gymViews.plan(p.id))}>
          <span style={{ fontWeight: 500 }}>{p.name}</span>
          {p.is_active && <span className="gym-badge gym-badge--accent">Active</span>}
        </button>
      ))}
    </div>
  );
}
