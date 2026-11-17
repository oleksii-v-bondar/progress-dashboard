import { describe, expect, it } from 'vitest';
import { formatSegment, formatSetLine, groupByExercise } from '../src/pages/gym/setFormat';

describe('formatSetLine', () => {
  it('formats loaded, bodyweight and assisted sets', () => {
    expect(formatSetLine(42.5, 8, 'easy')).toBe('42.5 kg × 8 (easy)');
    expect(formatSetLine(0, 12, 'ok')).toBe('Bodyweight × 12 reps (ok)');
    expect(formatSetLine(-20, 6, 'hard')).toBe('Assisted 20 kg × 6 (hard)');
  });
});

describe('formatSegment', () => {
  it('omits the weight for bodyweight segments', () => {
    expect(formatSegment(30, 6)).toBe('30×6');
    expect(formatSegment(0, 5)).toBe('×5');
  });
});

describe('groupByExercise', () => {
  it('groups in first-seen order', () => {
    const sets = [{ exercise_name: 'A', n: 1 }, { exercise_name: 'B', n: 2 }, { exercise_name: 'A', n: 3 }];
    expect(groupByExercise(sets)).toEqual([
      ['A', [sets[0], sets[2]]],
      ['B', [sets[1]]],
    ]);
  });
});
