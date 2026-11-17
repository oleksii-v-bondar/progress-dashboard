import { useEffect, useMemo, useRef, useState } from 'react';
import type { GymDayDetail, GymSetInput, GymSetLog } from '@shared/types';
import { api } from '../../api/client';
import { errorMessage, useAsync } from '../../hooks/useAsync';
import { ExerciseLogger } from './ExerciseLogger';
import { gymViews, Navigate } from './nav';
import { buildSchedule, carryWeight } from './schedule';

interface Loaded { day: GymDayDetail; sessionId: string; sets: GymSetLog[]; }

export function GymSessionView({ dayId, onNavigate }: { dayId: string; onNavigate: Navigate }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flashKey, setFlashKey] = useState(0);
  const [flashOn, setFlashOn] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // StrictMode runs effects twice in dev; the ref keeps us to a single start request.
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const day = await api.gymDay(dayId);
        const { id } = await api.gymStartSession(dayId);
        const session = await api.gymSession(id);
        setLoaded({ day, sessionId: id, sets: session.sets });
        setStep(session.sets.length);
      } catch (e) {
        setError(errorMessage(e));
      }
    })();
  }, [dayId]);

  useEffect(() => {
    if (!flashKey) return;
    setFlashOn(true);
    const t = setTimeout(() => setFlashOn(false), 1200);
    return () => clearTimeout(t);
  }, [flashKey]);

  const day = loaded?.day;
  const schedule = useMemo(() => (day ? buildSchedule(day) : []), [day]);
  const current = step < schedule.length ? schedule[step] : null;
  const exId = current?.exercise.id ?? null;
  // Tag the suggestion with its exercise id so a stale one never seeds the next exercise's logger.
  const suggestion = useAsync(
    async () => (exId ? { exId, ...(await api.gymSuggestion(exId)) } : null),
    [exId],
  );

  if (!loaded) {
    return error
      ? <div className="gym-page"><div className="gym-error">{error}</div></div>
      : <div className="gym-muted">Starting workout…</div>;
  }
  const { sessionId, sets } = loaded;

  const log = async (input: GymSetInput) => {
    if (!current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const set = { ...input, day_exercise_id: current.exercise.id, set_number: current.setNumber };
      const { id } = await api.gymLogSet(sessionId, set);
      const logged: GymSetLog = { ...set, id, exercise_name: current.exercise.exercise_name, created_at: new Date().toISOString() };
      setLoaded({ ...loaded, sets: [...sets, logged] });
      setStep((s) => s + 1);
      setFlashKey((k) => k + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      await api.gymFinishSession(sessionId);
      onNavigate(gymViews.plans);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const endEarly = () => {
    if (confirm('End this workout now? Logged sets are kept.')) finish();
  };

  const sug = suggestion.data && suggestion.data.exId === exId ? suggestion.data : null;

  return (
    <div className="gym-page">
      <div className="gym-row gym-wrap">
        <h2 className="gym-title">{loaded.day.name}</h2>
        {loaded.day.is_superset && <span className="gym-badge">Superset</span>}
      </div>
      {schedule.length > 0 && (
        <div className="gym-muted">
          Step {Math.min(step + 1, schedule.length)} of {schedule.length}
          {loaded.day.is_superset && current ? ` · round ${current.setNumber}` : ''}
        </div>
      )}
      {error && <div className="gym-error">{error}</div>}
      {current ? (
        sug ? (
          <ExerciseLogger
            key={step}
            exercise={current.exercise}
            setNumber={current.setNumber}
            initialWeight={carryWeight(sets, current.exercise.id) ?? sug.weight}
            reason={sug.reason}
            busy={busy}
            onLog={log}
          />
        ) : suggestion.error ? (
          <div className="gym-error">{suggestion.error}</div>
        ) : (
          <div className="gym-muted">Loading…</div>
        )
      ) : (
        <div className="gym-card">
          <div className="gym-subtitle">Session complete 💪</div>
          <div className="gym-muted">{sets.length} sets logged</div>
          <button className="gym-btn gym-btn--block" disabled={busy} onClick={finish}>Finish &amp; save</button>
        </div>
      )}
      {current && (
        <button className="gym-btn gym-btn--secondary" disabled={busy} onClick={endEarly}>End session early</button>
      )}
      {flashOn && <div className="flash-pill">✓ Set logged</div>}
    </div>
  );
}
