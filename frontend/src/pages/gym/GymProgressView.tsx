import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { Navigate } from './nav';
import { TrendBadge } from './TrendBadge';

// Recharts sets colours as SVG attributes, where CSS var() doesn't resolve.
const C = { success: '#10b981', accent: '#6366f1', muted: '#64748b', border: '#2d2d4a', bg: '#1a1a2e', text: '#e2e8f0' };
const round1 = (n: number) => Math.round(n * 10) / 10;

export function GymProgressView({ exerciseId }: { exerciseId: string; onNavigate: Navigate }) {
  const { data: trend, error } = useAsync(() => api.gymTrend(exerciseId), [exerciseId]);

  if (error) return <div className="gym-page"><div className="gym-error">{error}</div></div>;
  if (!trend) return <div className="gym-muted">Loading…</div>;

  const data = trend.series.map((p) => ({
    label: new Date(p.date).toLocaleDateString(),
    topWeight: p.topWeight,
    bestE1rm: round1(p.bestE1rm),
  }));

  return (
    <div className="gym-page">
      <h2 className="gym-title">{trend.exercise_name}</h2>
      <div className="gym-card"><TrendBadge label={trend.label} /></div>
      <div className="gym-card" style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke={C.muted} fontSize={11} />
            <YAxis stroke={C.muted} fontSize={11} domain={['auto', 'auto']} />
            <Tooltip contentStyle={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="topWeight" name="Top weight" stroke={C.success} strokeWidth={2} dot />
            <Line type="monotone" dataKey="bestE1rm" name="Est. 1RM" stroke={C.accent} strokeWidth={2} dot />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="gym-card">
        <span className="gym-subtitle">Recent sessions</span>
        {data.length === 0 && <div className="gym-muted">No finished sessions for this exercise yet.</div>}
        {[...data].reverse().map((p, i) => (
          <div key={i} className="gym-row gym-row--between">
            <span>{p.label}</span>
            <span>{p.topWeight} kg <span className="gym-muted">· e1RM {p.bestE1rm}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}
