export function formatSetLine(weight: number, reps: number, effort: string): string {
  if (weight < 0) return `Assisted ${Math.abs(weight)} kg × ${reps} (${effort})`;
  return weight === 0 ? `Bodyweight × ${reps} reps (${effort})` : `${weight} kg × ${reps} (${effort})`;
}

export function formatSegment(weight: number, reps: number): string {
  return weight === 0 ? `×${reps}` : `${weight}×${reps}`;
}

export function groupByExercise<T extends { exercise_name: string }>(sets: T[]): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const s of sets) {
    if (!groups.has(s.exercise_name)) groups.set(s.exercise_name, []);
    groups.get(s.exercise_name)!.push(s);
  }
  return [...groups.entries()];
}
