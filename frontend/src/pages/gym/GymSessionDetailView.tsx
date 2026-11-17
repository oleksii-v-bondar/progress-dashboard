import { api } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { gymViews, Navigate } from './nav';
import { formatSegment, formatSetLine, groupByExercise } from './setFormat';

export function GymSessionDetailView({ sessionId, onNavigate }: { sessionId: string; onNavigate: Navigate }) {
  const { data: session, error } = useAsync(() => api.gymSession(sessionId), [sessionId]);

  if (error) return <div className="gym-page"><div className="gym-error">{error}</div></div>;
  if (!session) return <div className="gym-muted">Loading…</div>;

  return (
    <div className="gym-page">
      <div className="gym-row gym-row--between">
        <h2 className="gym-title">{session.day_name}</h2>
        <button className="gym-btn gym-btn--secondary" onClick={() => onNavigate(gymViews.historyEdit(session.id))}>Edit</button>
      </div>
      {session.finished_at && <div className="gym-muted">{new Date(session.finished_at).toLocaleString()}</div>}
      {session.sets.length === 0 && <div className="gym-card"><div className="gym-muted">No sets logged.</div></div>}
      {groupByExercise(session.sets).map(([name, sets]) => (
        <div key={name} className="gym-card">
          <div className="gym-row gym-row--between">
            <span className="gym-subtitle">{name}</span>
            <button className="gym-icon-btn" title="Progress" onClick={() => onNavigate(gymViews.progress(sets[0].day_exercise_id))}>📈</button>
          </div>
          {sets.map((s) => (
            <div key={s.id}>
              <div>Set {s.set_number}: {formatSetLine(s.weight_used, s.reps_done, s.effort)}</div>
              {s.extra_segments.length > 0 && (
                <div className="gym-muted">+ {s.extra_segments.map((x) => formatSegment(x.weight, x.reps)).join(', ')}</div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
