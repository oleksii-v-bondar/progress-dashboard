import { useState } from 'react';
import { api } from '../../api/client';
import { errorMessage } from '../../hooks/useAsync';
import { gymViews, Navigate } from './nav';

export function GymNewPlanView({ onNavigate }: { onNavigate: Navigate }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { id } = await api.gymCreatePlan(name.trim());
      onNavigate(gymViews.edit(id));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const importFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      let json: unknown;
      try {
        json = JSON.parse(await file.text());
      } catch {
        throw new Error('File is not valid JSON');
      }
      const { id } = await api.gymImportPlan(json);
      onNavigate(gymViews.plan(id));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="gym-page">
      <h2 className="gym-title">New plan</h2>
      <form className="gym-card" onSubmit={create}>
        <label className="gym-field">
          Plan name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Push / Pull / Legs" autoFocus />
        </label>
        <button className="gym-btn" type="submit" disabled={busy || !name.trim()}>Create plan</button>
      </form>
      <div className="gym-card">
        <div className="gym-subtitle">Import from JSON</div>
        <div className="gym-muted">Use a file exported from this app or from the old gym tracker.</div>
        <input type="file" accept="application/json,.json" onChange={importFile} disabled={busy} />
      </div>
      {error && <div className="gym-error">{error}</div>}
    </div>
  );
}
