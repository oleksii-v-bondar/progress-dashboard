import type { GymExercise, GymSetLog } from '@shared/types';

export interface ScheduleStep {
  exercise: GymExercise;
  setNumber: number;
}

export function buildSchedule(day: { is_superset: boolean; exercises: GymExercise[] }): ScheduleStep[] {
  const steps: ScheduleStep[] = [];
  if (day.is_superset) {
    const rounds = Math.max(0, ...day.exercises.map((e) => e.target_sets));
    for (let r = 1; r <= rounds; r++) {
      for (const exercise of day.exercises) steps.push({ exercise, setNumber: r });
    }
  } else {
    for (const exercise of day.exercises) {
      for (let s = 1; s <= exercise.target_sets; s++) steps.push({ exercise, setNumber: s });
    }
  }
  return steps;
}

export function carryWeight(
  sets: Array<Pick<GymSetLog, 'day_exercise_id' | 'set_number' | 'weight_used'>>,
  exerciseId: string,
): number | null {
  const mine = sets.filter((s) => s.day_exercise_id === exerciseId);
  if (!mine.length) return null;
  return mine.reduce((a, b) => (b.set_number > a.set_number ? b : a)).weight_used;
}

export const completedSets = (setNumber: number, targetSets: number) =>
  Math.min(Math.max(setNumber - 1, 0), targetSets);
