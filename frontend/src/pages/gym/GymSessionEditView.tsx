import { useEffect, useRef, useState } from 'react';
import type { GymEffort } from '@shared/types';
import { api } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { gymViews, Navigate } from './nav';
import { groupByExercise } from './setFormat';

const EFFORTS: GymEffort[] = ['easy', 'ok', 'hard', 'failed'];
interface Draft { weight: string; reps: string; effort: GymEffort; segments: Array<{ weight: string; reps: string }>; }

export function GymSessionEditView({ sessionId, onNavigate }: { sessionId: string; onNavigate: Navigate }) {
  const { data: session, error: loadError, reload } = useAsync(() => api.gymSession(sessionId), [sessionId]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const seeded = useRef(false);

  useEffect(() => {
    if (!session || seeded.current) return;
    seeded.current = true;
    const d: Record<string, Draft> = {};
    for (const s of session.sets) {
      d[s.id] = {
        weight: String(s.weight_used),
        reps: String(s.reps_done),
        effort: s.effort,
        segments: s.extra_segments.map((x) => ({ weight: String(x.weight), reps: String(x.reps) })),
      };
    }
    setDrafts(d);
  }, [session]);

  const upd = (setId: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [setId]: { ...prev[setId], ...patch } }));
  const updSeg = (setId: string, i: number, field: 'weight' | 'reps', value: string) =>
    setDrafts((prev) => ({
      ...prev,
      [setId]: { ...prev[setId], segments: prev[setId].segments.map((sg, j) => (j === i ? { ...sg, [field]: value } : sg)) },
    }));

  const save = async () => {
    if (!session) return;
    const invalid = session.sets.some((s) => {
      const d = drafts[s.id];
      return !d || d.weight.trim() === '' || d.reps.trim() === '';
    });
    if (invalid) { setError('Weight and reps are required for every set.'); return; }
    setSaving(true);
    setError('');
    try {
      for (const s of session.sets) {
        const d = drafts[s.id];
        await api.gymUpdateSet(session.id, s.id, {
          weight_used: Number(d.weight),
          reps_done: Number(d.reps),
          effort: d.effort,
          extra_segments: d.segments
            .filter((x) => x.weight !== '' && x.reps !== '')
            .map((x) => ({ weight: Number(x.weight), reps: Number(x.reps) })),
        });
      }
      onNavigate(gymViews.historyDetail(session.id));
    } catch {
      await reload();
      setError('Some changes may not have been saved. Please review and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loadError) return <div className="gym-page"><div className="gym-error">{loadError}</div></div>;
  if (!session) return <div className="gym-muted">Loading…</div>;

  return (
    <div className="gym-page">
      <h2 className="gym-title">Edit — {session.day_name}</h2>
      {groupByExercise(session.sets).map(([name, sets]) => (
        <div key={name} className="gym-card">
          <span className="gym-subtitle">{name}</span>
          {sets.map((s) => {
            const d = drafts[s.id];
            if (!d) return null;
            return (
              <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="gym-muted">Set {s.set_number}</div>
                <div className="gym-row" style={{ alignItems: 'flex-end' }}>
                  <label className="gym-field" style={{ flex: 1 }}>
                    Weight
                    <input type="number" inputMode="decimal" step={0.5} value={d.weight} onChange={(e) => upd(s.id, { weight: e.target.value })} />
                  </label>
                  <label className="gym-field" style={{ flex: 1 }}>
                    Reps
                    <input type="number" inputMode="numeric" value={d.reps} onChange={(e) => upd(s.id, { reps: e.target.value })} />
                  </label>
                  <label className="gym-field" style={{ flex: 1 }}>
                    Effort
                    <select value={d.effort} onChange={(e) => upd(s.id, { effort: e.target.value as GymEffort })}>
                      {EFFORTS.map((ef) => <option key={ef} value={ef}>{ef}</option>)}
                    </select>
                  </label>
                </div>
                {d.segments.map((sg, i) => (
                  <div key={i} className="gym-row">
                    <input type="number" placeholder="weight" value={sg.weight} style={{ flex: 1 }}
                      onChange={(e) => updSeg(s.id, i, 'weight', e.target.value)} />
                    <input type="number" inputMode="numeric" placeholder="reps" value={sg.reps} style={{ flex: 1 }}
                      onChange={(e) => updSeg(s.id, i, 'reps', e.target.value)} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ))}
      {error && <div className="gym-error">{error}</div>}
      <div className="gym-row">
        <button className="gym-btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        <button className="gym-btn gym-btn--secondary" onClick={() => onNavigate(gymViews.historyDetail(session.id))}>Cancel</button>
      </div>
    </div>
  );
}
