import { useState } from 'react';
import type { GymEffort, GymExercise, GymSetInput } from '@shared/types';
import { completedSets } from './schedule';

const EFFORTS: GymEffort[] = ['easy', 'ok', 'hard', 'failed'];
interface Seg { weight: string; reps: string; }
const isNumStr = (s: string) => s.trim() !== '' && Number.isFinite(Number(s));
const isRepsStr = (s: string) => /^\d+$/.test(s.trim());

export function ExerciseLogger({ exercise, setNumber, initialWeight, reason, busy, onLog }: {
  exercise: GymExercise;
  setNumber: number;
  initialWeight: number | null;
  reason: string;
  busy: boolean;
  onLog: (set: GymSetInput) => void;
}) {
  const [weight, setWeight] = useState(initialWeight != null ? String(initialWeight) : '');
  const [reps, setReps] = useState(String(exercise.target_reps));
  const [segments, setSegments] = useState<Seg[]>(() =>
    exercise.extra_segments.map((t) => ({ weight: '', reps: String(t.reps) })));
  const [pendingFail, setPendingFail] = useState(false);
  const [failedReps, setFailedReps] = useState('');

  const done = completedSets(setNumber, exercise.target_sets);
  const canLog = !busy && isNumStr(weight) && isRepsStr(reps);

  const setSegment = (i: number, field: keyof Seg, value: string) =>
    setSegments((prev) => prev.map((s, j) => (j === i ? { ...s, [field]: value } : s)));

  const log = (effort: GymEffort, repsValue: string) =>
    onLog({
      weight_used: Number(weight),
      reps_done: Number(repsValue),
      effort,
      // Rows left without weight or reps are skipped, as in the original app.
      extra_segments: segments
        .filter((s) => isNumStr(s.weight) && isRepsStr(s.reps))
        .map((s) => ({ weight: Number(s.weight), reps: Number(s.reps) })),
    });

  const onEffort = (effort: GymEffort) => {
    if (effort === 'failed') {
      setFailedReps(reps);
      setPendingFail(true);
      return;
    }
    setPendingFail(false);
    log(effort, reps);
  };

  return (
    <div className="gym-card">
      <div className="gym-subtitle">{exercise.exercise_name}</div>
      <div className="gym-muted">
        Set {setNumber}/{exercise.target_sets} · target {exercise.target_reps} reps
        {exercise.rest_seconds != null ? ` · rest ${exercise.rest_seconds}s` : ''}
      </div>
      <div className="set-dots" aria-label={`${done} of ${exercise.target_sets} sets completed`}>
        {Array.from({ length: exercise.target_sets }, (_, i) => (
          <span key={i} className={i < done ? 'dot done' : i === setNumber - 1 ? 'dot current' : 'dot'} />
        ))}
      </div>
      <div>💡 {reason}</div>

      <div className="gym-grid-2">
        <label className="gym-field">
          Weight (0 = bodyweight, −assisted)
          <input type="number" inputMode="decimal" step={0.5} value={weight} onChange={(e) => setWeight(e.target.value)} />
        </label>
        <label className="gym-field">
          Reps done
          <input type="number" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} />
        </label>
      </div>

      {segments.map((s, i) => (
        <div key={i} className="gym-row">
          <input type="number" inputMode="decimal" placeholder="weight" value={s.weight} style={{ flex: 1 }}
            onChange={(e) => setSegment(i, 'weight', e.target.value)} />
          <input type="number" inputMode="numeric" placeholder="reps" value={s.reps} style={{ flex: 1 }}
            onChange={(e) => setSegment(i, 'reps', e.target.value)} />
          <button className="gym-icon-btn" title="Remove" onClick={() => setSegments((prev) => prev.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button className="gym-btn gym-btn--secondary" style={{ alignSelf: 'flex-start' }}
        onClick={() => setSegments((prev) => [...prev, { weight: '', reps: '' }])}>
        + add additional reps &amp; weight
      </button>

      <div className="gym-muted">How did it feel? (tap to log the set)</div>
      <div className="gym-effort">
        {EFFORTS.map((ef) => (
          <button key={ef} className={ef === 'failed' ? 'gym-btn gym-btn--danger' : 'gym-btn'} disabled={!canLog}
            onClick={() => onEffort(ef)}>
            {ef}
          </button>
        ))}
      </div>

      {pendingFail && (
        <div className="gym-card" style={{ background: 'var(--bg-tertiary)' }}>
          <div>How many reps did you complete?</div>
          <input type="number" inputMode="numeric" placeholder="reps completed" value={failedReps}
            onChange={(e) => setFailedReps(e.target.value)} />
          <div className="gym-row">
            <button className="gym-btn" disabled={!canLog || !isRepsStr(failedReps)}
              onClick={() => { setPendingFail(false); log('failed', failedReps); }}>
              Confirm
            </button>
            <button className="gym-btn gym-btn--secondary" onClick={() => setPendingFail(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
