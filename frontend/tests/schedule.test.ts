import { describe, expect, it } from 'vitest';
import type { GymExercise } from '@shared/types';
import { buildSchedule, carryWeight, completedSets } from '../src/pages/gym/schedule';

const ex = (id: string, target_sets: number): GymExercise => ({
  id, exercise_name: id, order_index: 0, target_sets, target_reps: 8,
  rest_seconds: null, starting_weight: null, extra_segments: [],
});
const steps = (day: { is_superset: boolean; exercises: GymExercise[] }) =>
  buildSchedule(day).map((s) => `${s.exercise.id}${s.setNumber}`);

describe('buildSchedule', () => {
  it('runs exercises one after another on normal days', () => {
    expect(steps({ is_superset: false, exercises: [ex('A', 2), ex('B', 1)] })).toEqual(['A1', 'A2', 'B1']);
  });

  it('runs rounds on superset days, every exercise in every round', () => {
    expect(steps({ is_superset: true, exercises: [ex('A', 2), ex('B', 3)] }))
      .toEqual(['A1', 'B1', 'A2', 'B2', 'A3', 'B3']);
  });

  it('is empty for a day without exercises', () => {
    expect(steps({ is_superset: true, exercises: [] })).toEqual([]);
  });
});

describe('carryWeight', () => {
  it('returns the weight of the highest logged set of that exercise', () => {
    const sets = [
      { day_exercise_id: 'A', set_number: 1, weight_used: 40 },
      { day_exercise_id: 'A', set_number: 2, weight_used: 42.5 },
      { day_exercise_id: 'B', set_number: 3, weight_used: 99 },
    ];
    expect(carryWeight(sets, 'A')).toBe(42.5);
    expect(carryWeight(sets, 'C')).toBeNull();
  });
});

describe('completedSets', () => {
  it('clamps to 0..targetSets', () => {
    expect(completedSets(1, 3)).toBe(0);
    expect(completedSets(3, 3)).toBe(2);
    expect(completedSets(5, 3)).toBe(3);
  });
});
