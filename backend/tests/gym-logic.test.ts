import { describe, it, expect } from 'vitest';
import { suggestNextWeight, computeTrend, epley } from '../src/gym/logic';

describe('suggestNextWeight', () => {
  const base = { targetReps: 8, increment: 2.5, startingWeight: null as number | null };

  it('uses the starting weight when there is no history', () => {
    expect(suggestNextWeight({ ...base, lastSets: null, startingWeight: 40 }))
      .toEqual({ weight: 40, reason: 'Starting weight 40 kg' });
  });

  it('asks for a weight when there is no history and no starting weight', () => {
    expect(suggestNextWeight({ ...base, lastSets: [] }).weight).toBeNull();
  });

  it('deloads from the heaviest set when any set failed', () => {
    const r = suggestNextWeight({ ...base, lastSets: [
      { weight_used: 50, reps_done: 8, effort: 'ok' },
      { weight_used: 52.5, reps_done: 8, effort: 'failed' },
    ] });
    expect(r.weight).toBe(50);
  });

  it('deloads when target reps were missed', () => {
    const r = suggestNextWeight({ ...base, lastSets: [{ weight_used: 50, reps_done: 6, effort: 'hard' }] });
    expect(r.weight).toBe(47.5);
  });

  it('adds the increment when every set felt easy', () => {
    const r = suggestNextWeight({ ...base, lastSets: [
      { weight_used: 50, reps_done: 8, effort: 'easy' },
      { weight_used: 50, reps_done: 8, effort: 'easy' },
    ] });
    expect(r.weight).toBe(52.5);
  });

  it('holds when reps were hit but not every set was easy', () => {
    const r = suggestNextWeight({ ...base, lastSets: [
      { weight_used: 50, reps_done: 8, effort: 'easy' },
      { weight_used: 50, reps_done: 8, effort: 'hard' },
    ] });
    expect(r.weight).toBe(50);
  });

  it('keeps assisted (negative) weights negative with no zero floor', () => {
    const r = suggestNextWeight({ ...base, lastSets: [{ weight_used: -20, reps_done: 8, effort: 'failed' }] });
    expect(r.weight).toBe(-22.5);
  });
});

describe('computeTrend', () => {
  const s = (date: string, w: number, reps = 5) => ({ date, sets: [{ weight_used: w, reps_done: reps }] });

  it('is insufficient with fewer than two non-empty sessions', () => {
    expect(computeTrend([s('d1', 50), { date: 'd2', sets: [] }])).toMatchObject({ label: 'insufficient', slope: 0 });
  });

  it('detects progression and uses Epley for e1RM', () => {
    const r = computeTrend([s('d1', 50), s('d2', 52.5), s('d3', 55)]);
    expect(r.label).toBe('progressing');
    expect(r.series[0]).toEqual({ date: 'd1', topWeight: 50, bestE1rm: epley(50, 5) });
    expect(epley(50, 5)).toBeCloseTo(58.333, 3);
  });

  it('detects regression', () => {
    expect(computeTrend([s('d1', 55), s('d2', 52.5), s('d3', 50)]).label).toBe('regressing');
  });

  it('is steady when flat', () => {
    expect(computeTrend([s('d1', 50), s('d2', 50)]).label).toBe('steady');
  });

  it('keeps only the last five sessions', () => {
    const r = computeTrend([1, 2, 3, 4, 5, 6, 7].map((i) => s(`d${i}`, 40 + i)));
    expect(r.series).toHaveLength(5);
    expect(r.series[0].date).toBe('d3');
  });
});
