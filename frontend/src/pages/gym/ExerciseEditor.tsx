import { useRef, useState } from 'react';
import type { GymExercise } from '@shared/types';
import { api } from '../../api/client';
import { gymViews, Navigate } from './nav';

export type Save = (fn: () => Promise<unknown>) => Promise<void>;

export function TextField({ label, value, className, onCommit }: {
  label?: string; value: string; className?: string; onCommit: (v: string) => void;
}) {
  const input = (
    <input
      className={className}
      defaultValue={value}
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (!v) e.target.value = value;
        else if (v !== value) onCommit(v);
      }}
    />
  );
  return label ? <label className="gym-field">{label}{input}</label> : input;
}

function NumField({ label, value, min, decimal, nullable, onCommit }: {
  label: string; value: number | null; min?: number; decimal?: boolean; nullable?: boolean;
  onCommit: (v: number | null) => void;
}) {
  const shown = value == null ? '' : String(value);
  return (
    <label className="gym-field">
      {label}
      <input
        type="number"
        inputMode={decimal ? 'decimal' : 'numeric'}
        step={decimal ? 0.5 : 1}
        defaultValue={shown}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          if (raw === '') {
            if (nullable) { if (value !== null) onCommit(null); } else e.target.value = shown;
            return;
          }
          const n = Number(raw);
          const ok = Number.isFinite(n) && (decimal || Number.isInteger(n)) && (min === undefined || n >= min);
          if (!ok) e.target.value = shown;
          else if (n !== value) onCommit(n);
        }}
      />
    </label>
  );
}

export function ExerciseEditor({ ex, onSave, onNavigate }: { ex: GymExercise; onSave: Save; onNavigate: Navigate }) {
  const [segs, setSegs] = useState<string[]>(ex.extra_segments.map((s) => String(s.reps)));
  const saved = useRef(segs);
  const update = (data: Parameters<typeof api.gymUpdateExercise>[1]) => onSave(() => api.gymUpdateExercise(ex.id, data));

  const commitSegs = (list: string[]) => {
    const nums = list.map(Number);
    if (nums.some((n) => !Number.isInteger(n) || n < 1)) { setSegs(saved.current); return; }
    setSegs(list);
    if (list.join() === saved.current.join()) return;
    saved.current = list;
    update({ extra_segments: nums.map((reps) => ({ reps })) });
  };

  const remove = () => {
    if (!confirm(`Delete "${ex.exercise_name}" and all its logged sets?`)) return;
    onSave(() => api.gymDeleteExercise(ex.id));
  };

  return (
    <div className="gym-card" style={{ background: 'var(--bg-tertiary)' }}>
      <div className="gym-row">
        <div style={{ flex: 1 }}>
          <TextField value={ex.exercise_name} onCommit={(v) => update({ exercise_name: v })} />
        </div>
        <button className="gym-icon-btn" title="Progress" onClick={() => onNavigate(gymViews.progress(ex.id))}>📈</button>
        <button className="gym-icon-btn" title="Delete exercise" onClick={remove}>✕</button>
      </div>
      <div className="gym-grid-2">
        <NumField label="Sets" value={ex.target_sets} min={1} onCommit={(v) => update({ target_sets: v! })} />
        <NumField label="Reps" value={ex.target_reps} min={1} onCommit={(v) => update({ target_reps: v! })} />
        <NumField label="Rest (s)" value={ex.rest_seconds} min={0} nullable onCommit={(v) => update({ rest_seconds: v })} />
        <NumField label="Start weight (kg)" value={ex.starting_weight} decimal nullable
          onCommit={(v) => update({ starting_weight: v })} />
      </div>
      <div className="gym-field">
        Drop/up sets (target reps)
        {segs.map((r, i) => (
          <div key={i} className="gym-row">
            <input
              type="number"
              inputMode="numeric"
              value={r}
              style={{ flex: 1 }}
              onChange={(e) => setSegs(segs.map((x, j) => (j === i ? e.target.value : x)))}
              onBlur={() => commitSegs(segs)}
            />
            <button className="gym-icon-btn" title="Remove" onClick={() => commitSegs(segs.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button className="gym-btn gym-btn--secondary" style={{ alignSelf: 'flex-start' }}
          onClick={() => commitSegs([...segs, String(ex.target_reps)])}>
          + drop/up
        </button>
      </div>
    </div>
  );
}
