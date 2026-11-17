import { useState } from 'react';
import type { GymExercise } from '@shared/types';
import { api } from '../../api/client';
import { errorMessage, useAsync } from '../../hooks/useAsync';
import { gymViews, Navigate } from './nav';

export function describeExercise(ex: GymExercise): string {
  const parts = [`${ex.target_sets} × ${ex.target_reps}`];
  if (ex.extra_segments.length) parts[0] += ` + ${ex.extra_segments.length} drop/up`;
  if (ex.rest_seconds != null) parts.push(`rest ${ex.rest_seconds}s`);
  if (ex.starting_weight != null) parts.push(`start ${ex.starting_weight} kg`);
  return parts.join(' · ');
}

function downloadJson(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function GymPlanView({ planId, onNavigate }: { planId: string; onNavigate: Navigate }) {
  const { data: plan, error, reload } = useAsync(() => api.gymPlan(planId), [planId]);
  const { data: active } = useAsync(() => api.gymActiveSessions(), []);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="gym-page"><div className="gym-error">{error}</div></div>;
  if (!plan) return <div className="gym-muted">Loading…</div>;

  const activeDayIds = new Set((active ?? []).map((s) => s.plan_day_id));

  const exportPlan = () =>
    act(async () => {
      const data = await api.gymExportPlan(plan.id);
      downloadJson(`${plan.name.replace(/[^\w\- ]+/g, '').trim() || 'plan'}.json`, data);
    });
  const deletePlan = () => {
    if (!confirm(`Delete plan "${plan.name}"?`)) return;
    act(async () => {
      await api.gymDeletePlan(plan.id);
      onNavigate(gymViews.plans);
    });
  };

  return (
    <div className="gym-page">
      <div className="gym-row gym-wrap">
        <h2 className="gym-title">{plan.name}</h2>
        {plan.is_active && <span className="gym-badge gym-badge--accent">Active</span>}
      </div>
      <div className="gym-row gym-wrap">
        <button className="gym-btn gym-btn--secondary" onClick={() => onNavigate(gymViews.edit(plan.id))}>Edit</button>
        {!plan.is_active && (
          <button className="gym-btn gym-btn--secondary" disabled={busy}
            onClick={() => act(async () => { await api.gymUpdatePlan(plan.id, { is_active: true }); await reload(); })}>
            Set active
          </button>
        )}
        <button className="gym-btn gym-btn--secondary" disabled={busy}
          onClick={() => act(async () => { const { id } = await api.gymDuplicatePlan(plan.id); onNavigate(gymViews.plan(id)); })}>
          Duplicate
        </button>
        <button className="gym-btn gym-btn--secondary" disabled={busy} onClick={exportPlan}>Export</button>
        <button className="gym-btn gym-btn--danger" disabled={busy} onClick={deletePlan}>Delete</button>
      </div>
      {actionError && <div className="gym-error">{actionError}</div>}
      {plan.days.length === 0 && (
        <div className="gym-card"><div className="gym-muted">This plan has no days yet. Use Edit to add some.</div></div>
      )}
      {plan.days.map((day) => (
        <div key={day.id} className="gym-card">
          <div className="gym-row gym-row--between gym-wrap">
            <div className="gym-row">
              <span className="gym-subtitle">{day.name}</span>
              {day.is_superset && <span className="gym-badge">Superset</span>}
            </div>
            <button className="gym-btn" disabled={day.exercises.length === 0} onClick={() => onNavigate(gymViews.session(day.id))}>
              {activeDayIds.has(day.id) ? 'Resume' : 'Start'}
            </button>
          </div>
          {day.exercises.length === 0 && <div className="gym-muted">No exercises</div>}
          {day.exercises.map((ex) => (
            <div key={ex.id} className="gym-row gym-row--between">
              <div>
                <div>{ex.exercise_name}</div>
                <div className="gym-muted">{describeExercise(ex)}</div>
              </div>
              <button className="gym-icon-btn" title="Progress" onClick={() => onNavigate(gymViews.progress(ex.id))}>📈</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
