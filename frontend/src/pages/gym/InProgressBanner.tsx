import { useState } from 'react';
import { api } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { gymViews, Navigate } from './nav';

export function InProgressBanner({ onNavigate }: { onNavigate: Navigate }) {
  const { data: sessions, reload } = useAsync(() => api.gymActiveSessions(), []);
  const [busy, setBusy] = useState(false);

  const discard = async (id: string) => {
    if (!confirm('Discard this in-progress workout?')) return;
    setBusy(true);
    try {
      await api.gymDeleteSession(id);
    } finally {
      setBusy(false);
      reload();
    }
  };

  if (!sessions || sessions.length === 0) return null;
  return (
    <>
      {sessions.map((s) => (
        <div key={s.id} className="gym-card" style={{ borderColor: 'var(--accent)' }}>
          <div>
            <div style={{ fontWeight: 600 }}>⏳ In progress: {s.day_name}</div>
            <div className="gym-muted">
              {s.set_count} sets logged · started {new Date(s.started_at).toLocaleString()}
            </div>
          </div>
          <div className="gym-row">
            <button className="gym-btn" onClick={() => onNavigate(gymViews.session(s.plan_day_id))}>Resume</button>
            <button className="gym-btn gym-btn--danger" disabled={busy} onClick={() => discard(s.id)}>Discard</button>
          </div>
        </div>
      ))}
    </>
  );
}
