export const EFFORTS = ['easy', 'ok', 'hard', 'failed'] as const;
export type Effort = (typeof EFFORTS)[number];
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SegmentTarget { reps: number; }
export interface LoggedSegment { weight: number; reps: number; }
export interface ExerciseImport {
  exercise_name: string;
  target_sets: number;
  target_reps: number;
  rest_seconds?: number | null;
  starting_weight?: number | null;
  extra_segments?: SegmentTarget[];
}
export interface DayImport { name: string; is_superset?: boolean; exercises: ExerciseImport[]; }
export interface PlanImport { name: string; days: DayImport[]; }
export interface SetInput {
  day_exercise_id?: string;
  set_number?: number;
  weight_used: number;
  reps_done: number;
  effort: Effort;
  extra_segments: LoggedSegment[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
export const isNonEmptyStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
export const isInt = (v: unknown, min: number): v is number => Number.isInteger(v) && (v as number) >= min;
export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isNumericStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && Number.isFinite(Number(v));

// lenientWeight: the old app's export serialises NUMERIC starting_weight as a string
export function validateExerciseFields(body: unknown, partial: boolean, lenientWeight = false): { errors: string[]; fields: Obj } {
  const b = isObj(body) ? body : {};
  const errors: string[] = [];
  const fields: Obj = {};
  const check = (
    key: string,
    required: boolean,
    ok: (v: unknown) => boolean,
    msg: string,
    map: (v: any) => unknown = (v) => v,
  ) => {
    if (b[key] === undefined) {
      if (required) errors.push(`${key} ${msg}`);
      return;
    }
    if (ok(b[key])) fields[key] = map(b[key]);
    else errors.push(`${key} ${msg}`);
  };
  check('exercise_name', !partial, isNonEmptyStr, 'must be a non-empty string', (v: string) => v.trim());
  check('target_sets', !partial, (v) => isInt(v, 1), 'must be a positive integer');
  check('target_reps', !partial, (v) => isInt(v, 1), 'must be a positive integer');
  check('order_index', false, (v) => isInt(v, 0), 'must be a non-negative integer');
  check('rest_seconds', false, (v) => v === null || isInt(v, 0), 'must be a non-negative integer or null');
  check(
    'starting_weight', false,
    (v) => v === null || isNum(v) || (lenientWeight && isNumericStr(v)),
    'must be a number or null',
    (v) => (typeof v === 'string' ? Number(v) : v),
  );
  check(
    'extra_segments', false,
    (v) => Array.isArray(v) && v.every((s) => isObj(s) && isInt(s.reps, 1)),
    'must be an array of { reps: positive integer }',
    (v: Obj[]) => v.map((s) => ({ reps: s.reps })),
  );
  return { errors, fields };
}

export function validatePlanImport(body: unknown): { ok: true; plan: PlanImport } | { ok: false; details: string[] } {
  if (!isObj(body)) return { ok: false, details: ['plan must be an object'] };
  const details: string[] = [];
  if (!isNonEmptyStr(body.name)) details.push('name must be a non-empty string');
  const days: DayImport[] = [];
  if (!Array.isArray(body.days)) {
    details.push('days must be an array');
  } else {
    body.days.forEach((d: unknown, i: number) => {
      const p = `days[${i}]`;
      if (!isObj(d)) { details.push(`${p} must be an object`); return; }
      if (!isNonEmptyStr(d.name)) details.push(`${p}.name must be a non-empty string`);
      if (d.is_superset !== undefined && typeof d.is_superset !== 'boolean') details.push(`${p}.is_superset must be a boolean`);
      const exercises: ExerciseImport[] = [];
      if (!Array.isArray(d.exercises)) {
        details.push(`${p}.exercises must be an array`);
      } else {
        d.exercises.forEach((e: unknown, j: number) => {
          if (!isObj(e)) { details.push(`${p}.exercises[${j}] must be an object`); return; }
          const { errors, fields } = validateExerciseFields(e, false, true);
          errors.forEach((m) => details.push(`${p}.exercises[${j}].${m}`));
          exercises.push(fields as unknown as ExerciseImport);
        });
      }
      days.push({ name: typeof d.name === 'string' ? d.name.trim() : '', is_superset: d.is_superset === true, exercises });
    });
  }
  if (details.length) return { ok: false, details };
  return { ok: true, plan: { name: (body.name as string).trim(), days } };
}

export function validateSetBody(body: unknown, isNew: boolean): { errors: string[]; set: SetInput } {
  const b = isObj(body) ? body : {};
  const errors: string[] = [];
  if (isNew) {
    if (typeof b.day_exercise_id !== 'string' || !UUID_RE.test(b.day_exercise_id)) errors.push('day_exercise_id must be a uuid');
    if (!isInt(b.set_number, 1)) errors.push('set_number must be a positive integer');
  }
  if (!isNum(b.weight_used)) errors.push('weight_used must be a number');
  if (!isInt(b.reps_done, 0)) errors.push('reps_done must be a non-negative integer');
  if (!EFFORTS.includes(b.effort as Effort)) errors.push(`effort must be one of ${EFFORTS.join(', ')}`);
  const segs = b.extra_segments === undefined && isNew ? [] : b.extra_segments;
  const segsOk = Array.isArray(segs) && segs.every((s) => isObj(s) && isNum(s.weight) && isInt(s.reps, 0));
  if (!segsOk) errors.push('extra_segments must be an array of { weight: number, reps: non-negative integer }');
  return {
    errors,
    set: {
      day_exercise_id: b.day_exercise_id as string | undefined,
      set_number: b.set_number as number | undefined,
      weight_used: b.weight_used as number,
      reps_done: b.reps_done as number,
      effort: b.effort as Effort,
      extra_segments: segsOk ? (segs as Obj[]).map((s) => ({ weight: s.weight as number, reps: s.reps as number })) : [],
    },
  };
}
