import { useState } from 'react';
import { api } from '../../api/client';
import { errorMessage, useAsync } from '../../hooks/useAsync';
import { ExerciseEditor, Save, TextField } from './ExerciseEditor';
import { gymViews, Navigate } from './nav';

export function GymPlanEditorView({ planId, onNavigate }: { planId: string; onNavigate: Navigate }) {
  const { data: plan, error, reload } = useAsync(() => api.gymPlan(planId), [planId]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rev, setRev] = useState(0);

  const save: Save = async (fn) => {
    setSaveError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setSaveError(errorMessage(e));
      await reload();
      setRev((r) => r + 1);
    }
  };

  if (error) return <div className="gym-page"><div className="gym-error">{error}</div></div>;
  if (!plan) return <div className="gym-muted">Loading…</div>;

  return (
    <div className="gym-page" key={rev}>
      <div className="gym-cap">Editing plan</div>
      <TextField className="gym-title-input" value={plan.name} onCommit={(v) => save(() => api.gymUpdatePlan(plan.id, { name: v }))} />
      {saveError && <div className="gym-error">{saveError}</div>}

      {plan.days.map((day) => (
        <div key={day.id} className="gym-card">
          <div className="gym-row">
            <div style={{ flex: 1 }}>
              <TextField value={day.name} onCommit={(v) => save(() => api.gymUpdateDay(day.id, { name: v }))} />
            </div>
            <button
              className="gym-icon-btn"
              title="Delete day"
              onClick={() => {
                if (confirm(`Delete day "${day.name}" and all its logged workouts?`)) save(() => api.gymDeleteDay(day.id));
              }}
            >
              ✕
            </button>
          </div>
          <label className="gym-check">
            <input
              type="checkbox"
              checked={day.is_superset}
              onChange={(e) => save(() => api.gymUpdateDay(day.id, { is_superset: e.target.checked }))}
            />
            Superset (one set of each exercise per round)
          </label>
          {day.exercises.map((ex) => (
            <ExerciseEditor key={ex.id} ex={ex} onSave={save} onNavigate={onNavigate} />
          ))}
          <button
            className="gym-btn gym-btn--secondary"
            onClick={() => save(() => api.gymAddExercise(day.id, { exercise_name: 'New exercise', target_sets: 3, target_reps: 8 }))}
          >
            + Add exercise
          </button>
        </div>
      ))}

      <button className="gym-btn gym-btn--secondary" onClick={() => save(() => api.gymAddDay(plan.id, 'New day'))}>+ Add day</button>
      <button className="gym-btn gym-btn--block" onClick={() => onNavigate(gymViews.plan(plan.id))}>Done</button>
    </div>
  );
}
