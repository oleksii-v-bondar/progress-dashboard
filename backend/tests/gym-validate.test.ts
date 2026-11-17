import { describe, it, expect } from 'vitest';
import { validatePlanImport, validateExerciseFields, validateSetBody } from '../src/gym/validate';

describe('validatePlanImport', () => {
  it('accepts a valid plan, trims names and strips unknown segment keys', () => {
    const r = validatePlanImport({ name: ' Push ', days: [{ name: 'A', is_superset: true, exercises: [
      { exercise_name: 'Bench', target_sets: 3, target_reps: 8, rest_seconds: null, starting_weight: -10,
        extra_segments: [{ reps: 6, junk: 1 }] },
    ] }, { name: 'Empty', exercises: [] }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.name).toBe('Push');
    expect(r.plan.days[0].exercises[0].extra_segments).toEqual([{ reps: 6 }]);
    expect(r.plan.days[1].is_superset).toBe(false);
  });

  it('reports nested errors with paths', () => {
    const r = validatePlanImport({ name: 'X', days: [{ name: '', exercises: [
      { exercise_name: 'Squat', target_sets: 0, target_reps: 5 },
    ] }] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.details).toContain('days[0].name must be a non-empty string');
    expect(r.details).toContain('days[0].exercises[0].target_sets must be a positive integer');
  });

  it('rejects a non-object body', () => {
    expect(validatePlanImport('nope')).toEqual({ ok: false, details: ['plan must be an object'] });
  });
});

describe('validateExerciseFields', () => {
  it('requires name, sets and reps when not partial', () => {
    expect(validateExerciseFields({}, false).errors).toEqual([
      'exercise_name must be a non-empty string',
      'target_sets must be a positive integer',
      'target_reps must be a positive integer',
    ]);
  });

  it('accepts partial updates with nullable rest and starting weight', () => {
    const r = validateExerciseFields({ rest_seconds: null, starting_weight: null, target_reps: 10 }, true);
    expect(r.errors).toEqual([]);
    expect(r.fields).toEqual({ rest_seconds: null, starting_weight: null, target_reps: 10 });
  });

  it('rejects segment targets with non-positive reps', () => {
    expect(validateExerciseFields({ extra_segments: [{ reps: 0 }] }, true).errors)
      .toEqual(['extra_segments must be an array of { reps: positive integer }']);
  });
});

describe('validateSetBody', () => {
  const id = '11111111-1111-1111-1111-111111111111';

  it('accepts negative weight, zero reps and defaults segments for new sets', () => {
    const r = validateSetBody({ day_exercise_id: id, set_number: 1, weight_used: -15, reps_done: 0, effort: 'failed' }, true);
    expect(r.errors).toEqual([]);
    expect(r.set.extra_segments).toEqual([]);
  });

  it('rejects a bad effort and fractional reps', () => {
    const r = validateSetBody({ weight_used: 10, reps_done: 1.5, effort: 'meh', extra_segments: [] }, false);
    expect(r.errors).toEqual(['reps_done must be a non-negative integer', 'effort must be one of easy, ok, hard, failed']);
  });

  it('requires ids for new sets and segments for updates', () => {
    expect(validateSetBody({ weight_used: 1, reps_done: 1, effort: 'ok' }, true).errors)
      .toEqual(['day_exercise_id must be a uuid', 'set_number must be a positive integer']);
    expect(validateSetBody({ weight_used: 1, reps_done: 1, effort: 'ok' }, false).errors)
      .toEqual(['extra_segments must be an array of { weight: number, reps: non-negative integer }']);
  });
});
