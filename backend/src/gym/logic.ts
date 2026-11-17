export type Effort = 'easy' | 'ok' | 'hard' | 'failed';
export interface PastSet { reps_done: number; effort: Effort; weight_used: number; }
export interface SuggestInput {
  lastSets: PastSet[] | null;
  targetReps: number;
  increment: number;
  startingWeight: number | null;
}
export interface Suggestion { weight: number | null; reason: string; }

export function suggestNextWeight(input: SuggestInput): Suggestion {
  const { lastSets, targetReps, increment, startingWeight } = input;
  if (!lastSets || lastSets.length === 0) {
    if (startingWeight != null) return { weight: startingWeight, reason: `Starting weight ${startingWeight} kg` };
    return { weight: null, reason: 'Enter a starting weight for this exercise' };
  }
  const lastWeight = Math.max(...lastSets.map((s) => s.weight_used));
  const anyFailed = lastSets.some((s) => s.effort === 'failed');
  const missedReps = lastSets.some((s) => s.reps_done < targetReps);
  if (anyFailed || missedReps) {
    return { weight: lastWeight - increment, reason: `Deload −${increment} kg (missed reps / failed a set)` };
  }
  if (lastSets.every((s) => s.effort === 'easy')) {
    return { weight: lastWeight + increment, reason: `Last time felt easy → +${increment} kg` };
  }
  return { weight: lastWeight, reason: 'Hold — you hit your reps but it was tough' };
}

export interface SessionPoint { date: string; topWeight: number; bestE1rm: number; }
export type TrendLabel = 'progressing' | 'steady' | 'regressing' | 'insufficient';
export interface TrendResult { series: SessionPoint[]; label: TrendLabel; slope: number; }

export function epley(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

function leastSquaresSlope(ys: number[]): number {
  const n = ys.length;
  const meanX = (n - 1) / 2;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (ys[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export function computeTrend(
  sessions: Array<{ date: string; sets: Array<{ weight_used: number; reps_done: number }> }>,
  window = 5,
): TrendResult {
  const points: SessionPoint[] = sessions
    .filter((s) => s.sets.length > 0)
    .map((s) => ({
      date: s.date,
      topWeight: Math.max(...s.sets.map((x) => x.weight_used)),
      bestE1rm: Math.max(...s.sets.map((x) => epley(x.weight_used, x.reps_done))),
    }));
  const series = points.slice(-window);
  if (series.length < 2) return { series, label: 'insufficient', slope: 0 };
  const slope = leastSquaresSlope(series.map((p) => p.bestE1rm));
  const label: TrendLabel = slope > 0.1 ? 'progressing' : slope < -0.1 ? 'regressing' : 'steady';
  return { series, label, slope };
}
