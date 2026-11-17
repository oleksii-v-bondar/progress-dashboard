import { useState } from 'react';
import { api } from '../../api/client';
import { errorMessage, useAsync } from '../../hooks/useAsync';
import { gymViews, Navigate } from './nav';

export function GymHistoryView({ onNavigate }: { onNavigate: Navigate }) {
  const { data: sessions, loading, error, reload } = useAsync(() => api.gymSessions(), []);
  const [actionError, setActionError] = useState<string | null>(null);

  const remove = async (id: string) => {
    if (!confirm('Delete this session?')) return;
    setActionError(null);
    try {
      await api.gymDeleteSession(id);
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      reload();
    }
  };

  return (
    <div className="gym-page">
      <h2 className="gym-title">Workout history</h2>
      {error && <div className="gym-error">{error}</div>}
      {actionError && <div className="gym-error">{actionError}</div>}
      {loading && !sessions && <div className="gym-muted">Loading…</div>}
      {sessions?.length === 0 && <div className="gym-card"><div className="gym-muted">No finished sessions yet.</div></div>}
      {sessions?.map((s) => (
        <div key={s.id} className="gym-list-row">
          <button style={{ flex: 1, textAlign: 'left' }} onClick={() => onNavigate(gymViews.historyDetail(s.id))}>
            <div style={{ fontWeight: 500 }}>{s.day_name}</div>
            <div className="gym-muted">{new Date(s.finished_at!).toLocaleString()} · {s.set_count} sets</div>
          </button>
          <button className="gym-btn gym-btn--danger" onClick={() => remove(s.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}
