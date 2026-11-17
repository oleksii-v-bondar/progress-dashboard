# Gym Tracker Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port every feature of `../gym-and-food` (gym workout tracker) into progress-dashboard as a "Gym" sidebar section for the single dashboard user.

**Architecture:** New `gym_*` Postgres tables; Express/Knex routes under `/api/gym` (behind the existing `authMiddleware`); React views in `frontend/src/pages/gym/` routed through the existing string-based `currentView` state (`gym-*` view ids). Pure algorithms (weight suggestion, trend, validation) live in `backend/src/gym/` and are unit-tested with vitest.

**Tech Stack:** Express 4 + Knex + pg (backend), React 18 + Vite (frontend), Recharts (new, charts), vitest (new, backend unit tests).

**Spec:** `docs/superpowers/specs/2026-11-17-gym-tracker-design.md`

## Global Constraints

- Single user: no `users` table, no `user_id` columns, no ownership/admin checks.
- No template concept; "Duplicate plan" replaces it. JSON import/export always available.
- All gym API paths are prefixed `/api/gym`; all are behind `authMiddleware`.
- Invalid input → `400 {error}`; missing / soft-deleted / non-UUID ids → `404 {error:'not found'}`.
- DELETE endpoints return `200 {success:true}` (frontend `request()` always parses JSON).
- Every async route handler is wrapped with `ah()` so errors become 500 (Express 4 doesn't catch async errors).
- JSONB columns are written with `JSON.stringify(...)` (Knex/pg would otherwise send JS arrays as Postgres arrays).
- `NUMERIC` columns come back from pg as strings — convert with `Number()` / `toNum()` before responding.
- Migration SQL must be idempotent (deploy runs every `database/migrations/*.sql` on each deploy).
- Visual style: only existing CSS variables (`--bg-secondary`, `--bg-tertiary`, `--border`, `--accent`, `--success`, `--danger`, `--text-*`); gym classes are prefixed `gym-` in `global.css`.
- Weight increment for suggestions: `2.5` kg. Trend window: last `5` finished sessions. Trend thresholds: slope `> 0.1` progressing, `< -0.1` regressing.
- "Set logged" flash lasts `1200` ms.
- Commit messages end with the trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.

## Local environment

- Docker Desktop must be running: `open -a Docker && until docker info >/dev/null 2>&1; do sleep 2; done`
- Dev stack: `docker compose up -d --build` (db :5432, backend :4000 with nodemon on mounted `backend/src`, frontend :3000 with Vite on mounted `frontend/src`). App password in dev: `admin`.
- Get an API token for curl checks (used in several tasks):

```bash
TOKEN=$(curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d '{"password":"admin"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
H="Authorization: Bearer $TOKEN"; J='Content-Type: application/json'; B=localhost:4000/api/gym
```

## File map

| File | Responsibility |
|---|---|
| `database/migrations/add_gym.sql` (new) | Idempotent gym schema |
| `database/init.sql` | Same schema for fresh DBs |
| `.github/workflows/deploy.yml` | Apply all migrations after deploy |
| `backend/src/gym/logic.ts` (new) | `suggestNextWeight`, `computeTrend`, `epley` |
| `backend/src/gym/validate.ts` (new) | Input validators + import types |
| `backend/tests/gym-logic.test.ts`, `backend/tests/gym-validate.test.ts` (new) | Unit tests |
| `backend/src/routes/gym/util.ts` (new) | `ah`, `requireUuidParams`, `notFound`, `toNum` |
| `backend/src/routes/gym/plans.ts` (new) | Plans / days / exercises / import / export / duplicate |
| `backend/src/routes/gym/sessions.ts` (new) | Sessions / sets / suggestion / trend |
| `backend/src/routes/gym/index.ts` (new) | Combines the two routers |
| `backend/src/index.ts` | Mount `/api/gym` |
| `shared/types.ts` | `Gym*` types |
| `frontend/src/api/client.ts` | `gym*` API functions |
| `frontend/src/hooks/useAsync.ts` (new) | Minimal data-loading hook |
| `frontend/src/styles/global.css` | `gym-*` classes, set dots, flash pill |
| `frontend/src/pages/gym/nav.ts` (new) | View ids, parser, sidebar section mapping |
| `frontend/src/pages/gym/GymRouter.tsx` (new) | Maps `gym-*` view → page |
| `frontend/src/pages/gym/*.tsx` (new) | Pages listed in the spec |
| `frontend/src/pages/gym/setFormat.ts`, `schedule.ts` (new) | Pure helpers: set formatting, grouping, workout schedule |
| `frontend/src/components/Sidebar.tsx` | "Gym" nav section |
| `frontend/src/App.tsx` | Route `gym-*` views to `GymRouter` |
| `scripts/migrate-gym-data.sh` (new) | One-off data copy from gym-and-food DB |

---

### Task 1: Database schema + deploy migration step

**Files:**
- Create: `database/migrations/add_gym.sql`
- Modify: `database/init.sql` (append)
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- Produces: tables `gym_plans`, `gym_plan_days`, `gym_day_exercises`, `gym_sessions`, `gym_set_logs`; enum `gym_effort`.

- [ ] **Step 1: Create `database/migrations/add_gym.sql`**

```sql
DO $$ BEGIN
  CREATE TYPE gym_effort AS ENUM ('easy', 'ok', 'hard', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS gym_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gym_plan_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES gym_plans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  is_superset BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS gym_day_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_day_id UUID NOT NULL REFERENCES gym_plan_days(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  target_sets INT NOT NULL,
  target_reps INT NOT NULL,
  rest_seconds INT,
  starting_weight NUMERIC,
  extra_segments JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS gym_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_day_id UUID NOT NULL REFERENCES gym_plan_days(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS gym_set_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES gym_sessions(id) ON DELETE CASCADE,
  day_exercise_id UUID NOT NULL REFERENCES gym_day_exercises(id) ON DELETE CASCADE,
  set_number INT NOT NULL,
  weight_used NUMERIC NOT NULL,
  reps_done INT NOT NULL,
  effort gym_effort NOT NULL,
  extra_segments JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gym_set_logs_ex_time ON gym_set_logs(day_exercise_id, created_at);
CREATE INDEX IF NOT EXISTS idx_gym_sessions_day_time ON gym_sessions(plan_day_id, started_at);
```

- [ ] **Step 2: Append the identical SQL to the end of `database/init.sql`**

Run: `printf '\n' >> database/init.sql && cat database/migrations/add_gym.sql >> database/init.sql`

- [ ] **Step 3: Apply the migration twice to the dev DB (proves idempotency)**

```bash
docker compose up -d db
for i in 1 2; do docker compose exec -T db psql -v ON_ERROR_STOP=1 -U progress -d progress < database/migrations/add_gym.sql; done
docker compose exec -T db psql -U progress -d progress -c '\dt gym_*'
```
Expected: both runs exit 0 (notices about "already exists" are fine); `\dt` lists the 5 `gym_*` tables.

- [ ] **Step 4: Make deploy apply all migrations.** In `.github/workflows/deploy.yml` replace the `script:` block with:

```yaml
          script: |
            cd /opt/progress-app
            git pull origin master
            docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
            for f in database/migrations/*.sql; do
              docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
                psql -v ON_ERROR_STOP=1 -U progress -d progress < "$f"
            done
```

- [ ] **Step 5: Commit**

```bash
git add database .github/workflows/deploy.yml
git commit -m "feat(db): gym tracker schema and auto-applied migrations

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Backend pure logic (suggestion, trend, validation) with unit tests

**Files:**
- Modify: `backend/package.json` (add `test` script + `vitest` devDependency)
- Create: `backend/src/gym/logic.ts`, `backend/src/gym/validate.ts`
- Test: `backend/tests/gym-logic.test.ts`, `backend/tests/gym-validate.test.ts`

**Interfaces:**
- Produces (`logic.ts`): `type Effort`; `suggestNextWeight(input: { lastSets: PastSet[] | null; targetReps: number; increment: number; startingWeight: number | null }): { weight: number | null; reason: string }`; `computeTrend(sessions: Array<{ date: string; sets: Array<{ weight_used: number; reps_done: number }> }>, window = 5): { series: Array<{date; topWeight; bestE1rm}>; label: 'progressing'|'steady'|'regressing'|'insufficient'; slope: number }`; `epley(weight, reps): number`.
- Produces (`validate.ts`): `EFFORTS`, `Effort`, `UUID_RE`, `isNonEmptyStr`, `isInt(v, min)`, `isNum`, `validateExerciseFields(body, partial) → { errors: string[]; fields: Record<string, unknown> }`, `validatePlanImport(body) → { ok: true; plan: PlanImport } | { ok: false; details: string[] }`, `validateSetBody(body, isNew) → { errors: string[]; set: SetInput }`, types `PlanImport`, `DayImport`, `ExerciseImport`, `SetInput`.

- [ ] **Step 1: Install vitest and add the script**

```bash
cd backend && npm install -D vitest@^2 && npm pkg set scripts.test="vitest run"
```
Tests live in `backend/tests/` (outside `src/`, so `tsc` doesn't compile them into `dist`).

- [ ] **Step 2: Write failing tests `backend/tests/gym-logic.test.ts`**

```ts
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
```

- [ ] **Step 3: Write failing tests `backend/tests/gym-validate.test.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd backend && npm test`
Expected: FAIL — cannot resolve `../src/gym/logic` / `../src/gym/validate`.

- [ ] **Step 5: Create `backend/src/gym/logic.ts`** (ported verbatim from gym-and-food `api/src/suggestion/suggest.ts` + `api/src/trend/trend.ts`)

```ts
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
```

- [ ] **Step 6: Create `backend/src/gym/validate.ts`**

```ts
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

export function validateExerciseFields(body: unknown, partial: boolean): { errors: string[]; fields: Obj } {
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
  check('starting_weight', false, (v) => v === null || isNum(v), 'must be a number or null');
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
          const { errors, fields } = validateExerciseFields(e, false);
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
```

- [ ] **Step 7: Run tests to verify they pass, and type-check**

Run: `cd backend && npm test && npx tsc --noEmit`
Expected: all tests PASS; tsc exits 0.

- [ ] **Step 8: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/gym backend/tests
git commit -m "feat(gym): weight suggestion, trend and validation logic with tests

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Plan / day / exercise API routes

**Files:**
- Create: `backend/src/routes/gym/util.ts`, `backend/src/routes/gym/plans.ts`, `backend/src/routes/gym/index.ts`
- Modify: `backend/src/index.ts` (mount `/api/gym`)

(The spec names a single `routes/gym.ts`; it is split into `routes/gym/{util,plans,sessions,index}.ts` to keep files focused. Behaviour is identical.)

**Interfaces:**
- Consumes: `validateExerciseFields`, `validatePlanImport`, `isNonEmptyStr`, `isInt`, `UUID_RE`, `PlanImport` from `backend/src/gym/validate.ts` (Task 2).
- Produces: `ah`, `notFound`, `requireUuidParams`, `toNum` (util.ts); `findLiveDay(id, q?)`, `findLiveExercise(id, q?)` exported from plans.ts (used by Task 4); default-exported routers; endpoints from the spec API table (plans/days/exercises rows).

- [ ] **Step 1: Create `backend/src/routes/gym/util.ts`**

```ts
import { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import { UUID_RE } from '../../gym/validate';

export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export const notFound = (res: Response) => res.status(404).json({ error: 'not found' });

export function requireUuidParams(router: Router, ...names: string[]) {
  for (const name of names) {
    router.param(name, (_req, res, next, value) => (UUID_RE.test(String(value)) ? next() : notFound(res)));
  }
}

export const toNum = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
```

- [ ] **Step 2: Create `backend/src/routes/gym/plans.ts`**

```ts
import { Router } from 'express';
import { Knex } from 'knex';
import db from '../../db/knex';
import { isInt, isNonEmptyStr, PlanImport, validateExerciseFields, validatePlanImport } from '../../gym/validate';
import { ah, notFound, requireUuidParams, toNum } from './util';

const router = Router();
requireUuidParams(router, 'id', 'dayId', 'exId');

type Q = Knex | Knex.Transaction;
const EX_COLS = ['id', 'exercise_name', 'order_index', 'target_sets', 'target_reps', 'rest_seconds', 'starting_weight', 'extra_segments'];

const livePlan = (id: string, q: Q = db) => q('gym_plans').where({ id }).whereNull('deleted_at').first();

export function findLiveDay(id: string, q: Q = db) {
  return q('gym_plan_days as d')
    .join('gym_plans as p', 'p.id', 'd.plan_id')
    .where('d.id', id)
    .whereNull('p.deleted_at')
    .first('d.id', 'd.name', 'd.is_superset', 'd.plan_id', 'd.order_index');
}

export function findLiveExercise(id: string, q: Q = db) {
  return q('gym_day_exercises as e')
    .join('gym_plan_days as d', 'd.id', 'e.plan_day_id')
    .join('gym_plans as p', 'p.id', 'd.plan_id')
    .where('e.id', id)
    .whereNull('p.deleted_at')
    .first('e.*');
}

async function loadExercises(dayIds: string[], q: Q = db) {
  if (!dayIds.length) return [];
  const rows = await q('gym_day_exercises')
    .whereIn('plan_day_id', dayIds)
    .orderBy(['order_index', 'id'])
    .select([...EX_COLS, 'plan_day_id']);
  return rows.map((e: any) => ({ ...e, starting_weight: toNum(e.starting_weight) }));
}

async function loadPlanTree(id: string, q: Q = db) {
  const plan = await livePlan(id, q);
  if (!plan) return null;
  const days = await q('gym_plan_days').where({ plan_id: id }).orderBy(['order_index', 'id'])
    .select('id', 'name', 'order_index', 'is_superset');
  const exercises = await loadExercises(days.map((d: any) => d.id), q);
  return {
    id: plan.id as string,
    name: plan.name as string,
    is_active: plan.is_active as boolean,
    days: days.map((d: any) => ({
      ...d,
      exercises: exercises.filter((e: any) => e.plan_day_id === d.id).map(({ plan_day_id, ...e }: any) => e),
    })),
  };
}

type PlanTree = NonNullable<Awaited<ReturnType<typeof loadPlanTree>>>;

function treeToImport(tree: PlanTree): PlanImport {
  return {
    name: tree.name,
    days: tree.days.map((d: any) => ({
      name: d.name,
      is_superset: d.is_superset,
      exercises: d.exercises.map((e: any) => ({
        exercise_name: e.exercise_name,
        target_sets: e.target_sets,
        target_reps: e.target_reps,
        rest_seconds: e.rest_seconds,
        starting_weight: e.starting_weight,
        extra_segments: e.extra_segments,
      })),
    })),
  };
}

async function insertPlanTree(plan: PlanImport, trx: Knex.Transaction): Promise<string> {
  const [{ id }] = await trx('gym_plans').insert({ name: plan.name }).returning('id');
  for (const [i, d] of plan.days.entries()) {
    const [{ id: dayId }] = await trx('gym_plan_days')
      .insert({ plan_id: id, name: d.name, order_index: i, is_superset: !!d.is_superset })
      .returning('id');
    if (d.exercises.length) {
      await trx('gym_day_exercises').insert(
        d.exercises.map((e, j) => ({
          plan_day_id: dayId,
          exercise_name: e.exercise_name,
          order_index: j,
          target_sets: e.target_sets,
          target_reps: e.target_reps,
          rest_seconds: e.rest_seconds ?? null,
          starting_weight: e.starting_weight ?? null,
          extra_segments: JSON.stringify(e.extra_segments ?? []),
        })),
      );
    }
  }
  return id;
}

async function nextOrder(table: string, column: string, value: string): Promise<number> {
  const row: any = await db(table).where(column, value).max('order_index as m').first();
  return row?.m == null ? 0 : Number(row.m) + 1;
}

// ---- plans ----
router.get('/plans', ah(async (_req, res) => {
  res.json(await db('gym_plans').whereNull('deleted_at').orderBy(['created_at', 'name']).select('id', 'name', 'is_active'));
}));

router.post('/plans', ah(async (req, res) => {
  if (!isNonEmptyStr(req.body?.name)) return res.status(400).json({ error: 'name must be a non-empty string' });
  const [{ id }] = await db('gym_plans').insert({ name: req.body.name.trim() }).returning('id');
  res.status(201).json({ id });
}));

// IMPORTANT: /plans/import must be registered before /plans/:id routes.
router.post('/plans/import', ah(async (req, res) => {
  const r = validatePlanImport(req.body);
  if (!r.ok) return res.status(400).json({ error: 'invalid plan', details: r.details });
  const id = await db.transaction((trx) => insertPlanTree(r.plan, trx));
  res.status(201).json({ id });
}));

router.get('/plans/:id', ah(async (req, res) => {
  const tree = await loadPlanTree(req.params.id);
  return tree ? res.json(tree) : notFound(res);
}));

router.put('/plans/:id', ah(async (req, res) => {
  const { id } = req.params;
  const { name, is_active } = req.body ?? {};
  if (name !== undefined && !isNonEmptyStr(name)) return res.status(400).json({ error: 'name must be a non-empty string' });
  if (is_active !== undefined && typeof is_active !== 'boolean') return res.status(400).json({ error: 'is_active must be a boolean' });
  if (!(await livePlan(id))) return notFound(res);
  await db.transaction(async (trx) => {
    if (is_active === true) await trx('gym_plans').whereNot({ id }).update({ is_active: false });
    const patch: Record<string, unknown> = {};
    if (name !== undefined) patch.name = name.trim();
    if (is_active !== undefined) patch.is_active = is_active;
    if (Object.keys(patch).length) await trx('gym_plans').where({ id }).update(patch);
  });
  res.json({ id });
}));

router.delete('/plans/:id', ah(async (req, res) => {
  if (!(await livePlan(req.params.id))) return notFound(res);
  await db('gym_plans').where({ id: req.params.id }).update({ deleted_at: db.fn.now(), is_active: false });
  res.json({ success: true });
}));

router.post('/plans/:id/duplicate', ah(async (req, res) => {
  const tree = await loadPlanTree(req.params.id);
  if (!tree) return notFound(res);
  const copy = { ...treeToImport(tree), name: `${tree.name} (copy)` };
  const id = await db.transaction((trx) => insertPlanTree(copy, trx));
  res.status(201).json({ id });
}));

router.get('/plans/:id/export', ah(async (req, res) => {
  const tree = await loadPlanTree(req.params.id);
  return tree ? res.json(treeToImport(tree)) : notFound(res);
}));

// ---- days ----
router.post('/plans/:id/days', ah(async (req, res) => {
  const { name, is_superset } = req.body ?? {};
  if (!isNonEmptyStr(name)) return res.status(400).json({ error: 'name must be a non-empty string' });
  if (is_superset !== undefined && typeof is_superset !== 'boolean') return res.status(400).json({ error: 'is_superset must be a boolean' });
  if (!(await livePlan(req.params.id))) return notFound(res);
  const order_index = await nextOrder('gym_plan_days', 'plan_id', req.params.id);
  const [{ id }] = await db('gym_plan_days')
    .insert({ plan_id: req.params.id, name: name.trim(), order_index, is_superset: is_superset === true })
    .returning('id');
  res.status(201).json({ id });
}));

router.get('/days/:dayId', ah(async (req, res) => {
  const day = await findLiveDay(req.params.dayId);
  if (!day) return notFound(res);
  const exercises = (await loadExercises([day.id])).map(({ plan_day_id, ...e }: any) => e);
  res.json({ id: day.id, name: day.name, is_superset: day.is_superset, plan_id: day.plan_id, exercises });
}));

router.put('/days/:dayId', ah(async (req, res) => {
  const { name, order_index, is_superset } = req.body ?? {};
  if (name !== undefined && !isNonEmptyStr(name)) return res.status(400).json({ error: 'name must be a non-empty string' });
  if (order_index !== undefined && !isInt(order_index, 0)) return res.status(400).json({ error: 'order_index must be a non-negative integer' });
  if (is_superset !== undefined && typeof is_superset !== 'boolean') return res.status(400).json({ error: 'is_superset must be a boolean' });
  if (!(await findLiveDay(req.params.dayId))) return notFound(res);
  const patch: Record<string, unknown> = {};
  if (name !== undefined) patch.name = name.trim();
  if (order_index !== undefined) patch.order_index = order_index;
  if (is_superset !== undefined) patch.is_superset = is_superset;
  if (Object.keys(patch).length) await db('gym_plan_days').where({ id: req.params.dayId }).update(patch);
  res.json({ id: req.params.dayId });
}));

router.delete('/days/:dayId', ah(async (req, res) => {
  if (!(await findLiveDay(req.params.dayId))) return notFound(res);
  await db('gym_plan_days').where({ id: req.params.dayId }).del();
  res.json({ success: true });
}));

// ---- exercises ----
router.post('/days/:dayId/exercises', ah(async (req, res) => {
  const { errors, fields } = validateExerciseFields(req.body, false);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  if (!(await findLiveDay(req.params.dayId))) return notFound(res);
  const order_index = (fields.order_index as number | undefined) ?? (await nextOrder('gym_day_exercises', 'plan_day_id', req.params.dayId));
  const [{ id }] = await db('gym_day_exercises')
    .insert({
      ...fields,
      plan_day_id: req.params.dayId,
      order_index,
      extra_segments: JSON.stringify(fields.extra_segments ?? []),
    })
    .returning('id');
  res.status(201).json({ id });
}));

router.put('/exercises/:exId', ah(async (req, res) => {
  const { errors, fields } = validateExerciseFields(req.body, true);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  if (!(await findLiveExercise(req.params.exId))) return notFound(res);
  if (fields.extra_segments !== undefined) fields.extra_segments = JSON.stringify(fields.extra_segments);
  if (Object.keys(fields).length) await db('gym_day_exercises').where({ id: req.params.exId }).update(fields);
  res.json({ id: req.params.exId });
}));

router.delete('/exercises/:exId', ah(async (req, res) => {
  if (!(await findLiveExercise(req.params.exId))) return notFound(res);
  await db('gym_day_exercises').where({ id: req.params.exId }).del();
  res.json({ success: true });
}));

export default router;
```

- [ ] **Step 3: Create `backend/src/routes/gym/index.ts`** (Task 4 adds the sessions router here)

```ts
import { ErrorRequestHandler, Router } from 'express';
import plansRouter from './plans';

const router = Router();
router.use(plansRouter);

const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error('[gym]', err);
  res.status(500).json({ error: 'internal error' });
};
router.use(onError);

export default router;
```

- [ ] **Step 4: Mount in `backend/src/index.ts`**

Add the import after `import todosRouter from './routes/todos';`:
```ts
import gymRouter from './routes/gym';
```
Add after `app.use('/api/todos', authMiddleware, todosRouter);`:
```ts
app.use('/api/gym', authMiddleware, gymRouter);
```

- [ ] **Step 5: Type-check**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Smoke test against the dev stack** (start Docker first — see "Local environment")

```bash
docker compose up -d --build && sleep 8
TOKEN=$(curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d '{"password":"admin"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
H="Authorization: Bearer $TOKEN"; J='Content-Type: application/json'; B=localhost:4000/api/gym
PID=$(curl -s -X POST $B/plans/import -H "$H" -H "$J" -d '{"name":"Smoke","days":[{"name":"A","is_superset":true,"exercises":[{"exercise_name":"Bench","target_sets":3,"target_reps":8,"starting_weight":40,"extra_segments":[{"reps":6}]}]}]}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -s $B/plans/$PID -H "$H"; echo
curl -s $B/plans/$PID/export -H "$H"; echo
curl -s -X PUT $B/plans/$PID -H "$H" -H "$J" -d '{"is_active":true}'; echo
DUP=$(curl -s -X POST $B/plans/$PID/duplicate -H "$H" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -s $B/plans -H "$H"; echo
curl -s -o /dev/null -w '%{http_code}\n' $B/plans/not-a-uuid -H "$H"
curl -s -w ' %{http_code}\n' -X POST $B/plans/import -H "$H" -H "$J" -d '{"name":"","days":[]}'
curl -s -X DELETE $B/plans/$DUP -H "$H"; echo
curl -s -o /dev/null -w '%{http_code}\n' $B/plans/$DUP -H "$H"
```
Expected:
- the tree has one day with `is_superset:true` and one exercise with `starting_weight:40` (a number) and `extra_segments:[{"reps":6}]`
- the export has no `id`/`order_index` keys
- PUT returns `{"id":"…"}`; the plans list shows `Smoke` (active) and `Smoke (copy)` (inactive)
- `not-a-uuid` → `404`
- the bad import → `{"error":"invalid plan","details":["name must be a non-empty string"]} 400`
- DELETE → `{"success":true}`; the deleted plan then → `404`

Keep `$PID` for Task 4 or re-import.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/gym backend/src/index.ts
git commit -m "feat(gym): plan, day and exercise API with import/export/duplicate

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Session, set, suggestion and trend API routes

**Files:**
- Create: `backend/src/routes/gym/sessions.ts`
- Modify: `backend/src/routes/gym/index.ts`

**Interfaces:**
- Consumes: `ah`, `notFound`, `requireUuidParams`, `toNum` (util.ts); `findLiveDay`, `findLiveExercise` (plans.ts); `suggestNextWeight`, `computeTrend` (logic.ts); `validateSetBody`, `UUID_RE` (validate.ts).
- Produces: the session/set/suggestion/trend endpoints from the spec API table. Response shapes:
  - `POST /sessions` → `{id, started_at}` (200 when reused, 201 when created)
  - `GET /sessions` → `{id, plan_day_id, started_at, finished_at, day_name, set_count}[]` (finished, newest first)
  - `GET /sessions/active` → same shape with `finished_at: null` (newest first)
  - `GET /sessions/:id` → `{id, plan_day_id, started_at, finished_at, day_name, sets: [{id, day_exercise_id, exercise_name, set_number, weight_used: number, reps_done, effort, extra_segments, created_at}]}`
  - `GET /exercises/:exId/suggestion` → `{weight: number|null, reason}`
  - `GET /exercises/:exId/trend` → `{exercise_name, series:[{date, topWeight, bestE1rm}], label, slope}`

- [ ] **Step 1: Create `backend/src/routes/gym/sessions.ts`**

```ts
import { Router } from 'express';
import db from '../../db/knex';
import { computeTrend, suggestNextWeight } from '../../gym/logic';
import { UUID_RE, validateSetBody } from '../../gym/validate';
import { findLiveDay, findLiveExercise } from './plans';
import { ah, notFound, requireUuidParams, toNum } from './util';

const router = Router();
requireUuidParams(router, 'id', 'setId', 'exId');

const sessionRows = () =>
  db('gym_sessions as s')
    .join('gym_plan_days as d', 'd.id', 's.plan_day_id')
    .select(
      's.id', 's.plan_day_id', 's.started_at', 's.finished_at', 'd.name as day_name',
      db.raw('(select count(*)::int from gym_set_logs l where l.session_id = s.id) as set_count'),
    );

router.post('/sessions', ah(async (req, res) => {
  const dayId = req.body?.plan_day_id;
  if (typeof dayId !== 'string' || !UUID_RE.test(dayId)) return res.status(400).json({ error: 'plan_day_id must be a uuid' });
  if (!(await findLiveDay(dayId))) return notFound(res);
  const existing = await db('gym_sessions').where({ plan_day_id: dayId }).whereNull('finished_at')
    .orderBy('started_at', 'desc').first('id', 'started_at');
  if (existing) return res.json(existing);
  const [created] = await db('gym_sessions').insert({ plan_day_id: dayId }).returning(['id', 'started_at']);
  res.status(201).json(created);
}));

router.get('/sessions', ah(async (_req, res) => {
  res.json(await sessionRows().whereNotNull('s.finished_at').orderBy('s.finished_at', 'desc'));
}));

// IMPORTANT: /sessions/active must be registered before /sessions/:id.
router.get('/sessions/active', ah(async (_req, res) => {
  res.json(await sessionRows().whereNull('s.finished_at').orderBy('s.started_at', 'desc'));
}));

router.get('/sessions/:id', ah(async (req, res) => {
  const session = await sessionRows().where('s.id', req.params.id).first();
  if (!session) return notFound(res);
  const sets = await db('gym_set_logs as l')
    .join('gym_day_exercises as e', 'e.id', 'l.day_exercise_id')
    .where('l.session_id', req.params.id)
    .orderBy(['e.order_index', 'l.set_number', 'l.created_at'])
    .select('l.id', 'l.day_exercise_id', 'e.exercise_name', 'l.set_number', 'l.weight_used', 'l.reps_done',
      'l.effort', 'l.extra_segments', 'l.created_at');
  const { set_count, ...rest } = session;
  res.json({ ...rest, sets: sets.map((s: any) => ({ ...s, weight_used: Number(s.weight_used) })) });
}));

router.delete('/sessions/:id', ah(async (req, res) => {
  const n = await db('gym_sessions').where({ id: req.params.id }).del();
  return n ? res.json({ success: true }) : notFound(res);
}));

router.post('/sessions/:id/sets', ah(async (req, res) => {
  const session = await db('gym_sessions').where({ id: req.params.id }).first();
  if (!session) return notFound(res);
  const { errors, set } = validateSetBody(req.body, true);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  const belongs = await db('gym_day_exercises').where({ id: set.day_exercise_id, plan_day_id: session.plan_day_id }).first('id');
  if (!belongs) return res.status(400).json({ error: 'day_exercise_id does not belong to this session' });
  const [{ id }] = await db('gym_set_logs')
    .insert({ ...set, session_id: req.params.id, extra_segments: JSON.stringify(set.extra_segments) })
    .returning('id');
  res.status(201).json({ id });
}));

router.patch('/sessions/:id/sets/:setId', ah(async (req, res) => {
  const { errors, set } = validateSetBody(req.body, false);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  const [row] = await db('gym_set_logs')
    .where({ id: req.params.setId, session_id: req.params.id })
    .update({
      weight_used: set.weight_used,
      reps_done: set.reps_done,
      effort: set.effort,
      extra_segments: JSON.stringify(set.extra_segments),
    })
    .returning('id');
  return row ? res.json({ id: row.id }) : notFound(res);
}));

router.post('/sessions/:id/finish', ah(async (req, res) => {
  const [row] = await db('gym_sessions')
    .where({ id: req.params.id })
    .update({ finished_at: db.raw('coalesce(finished_at, now())') })
    .returning(['id', 'finished_at']);
  return row ? res.json(row) : notFound(res);
}));

router.get('/exercises/:exId/suggestion', ah(async (req, res) => {
  const ex = await findLiveExercise(req.params.exId);
  if (!ex) return notFound(res);
  const last = await db('gym_set_logs as l')
    .join('gym_sessions as s', 's.id', 'l.session_id')
    .where('l.day_exercise_id', ex.id)
    .whereNotNull('s.finished_at')
    .orderBy([{ column: 's.finished_at', order: 'desc' }, { column: 's.id', order: 'desc' }])
    .first('s.id');
  const sets = last
    ? await db('gym_set_logs').where({ session_id: last.id, day_exercise_id: ex.id }).select('weight_used', 'reps_done', 'effort')
    : [];
  res.json(suggestNextWeight({
    lastSets: sets.map((s: any) => ({ ...s, weight_used: Number(s.weight_used) })),
    targetReps: ex.target_reps,
    increment: 2.5,
    startingWeight: toNum(ex.starting_weight),
  }));
}));

router.get('/exercises/:exId/trend', ah(async (req, res) => {
  const ex = await findLiveExercise(req.params.exId);
  if (!ex) return notFound(res);
  const rows = await db('gym_set_logs as l')
    .join('gym_sessions as s', 's.id', 'l.session_id')
    .where('l.day_exercise_id', ex.id)
    .whereNotNull('s.finished_at')
    .orderBy([{ column: 's.finished_at' }, { column: 's.id' }])
    .select('s.id as session_id', 's.finished_at', 'l.weight_used', 'l.reps_done');
  const sessions: Array<{ id: string; date: string; sets: Array<{ weight_used: number; reps_done: number }> }> = [];
  for (const r of rows as any[]) {
    let cur = sessions[sessions.length - 1];
    if (!cur || cur.id !== r.session_id) {
      cur = { id: r.session_id, date: new Date(r.finished_at).toISOString(), sets: [] };
      sessions.push(cur);
    }
    cur.sets.push({ weight_used: Number(r.weight_used), reps_done: r.reps_done });
  }
  res.json({ exercise_name: ex.exercise_name, ...computeTrend(sessions) });
}));

export default router;
```

- [ ] **Step 2: Register the router in `backend/src/routes/gym/index.ts`**

Add `import sessionsRouter from './sessions';` below the plans import and `router.use(sessionsRouter);` directly after `router.use(plansRouter);` (before the error handler).

- [ ] **Step 3: Type-check and unit tests**

Run: `cd backend && npx tsc --noEmit && npm test`
Expected: exit 0; tests PASS.

- [ ] **Step 4: Smoke test the workout flow** (nodemon reloads automatically; reuse the shell variables from Task 3 Step 6)

```bash
DAY=$(curl -s $B/plans/$PID -H "$H" | python3 -c 'import sys,json;print(json.load(sys.stdin)["days"][0]["id"])')
EX=$(curl -s $B/days/$DAY -H "$H" | python3 -c 'import sys,json;print(json.load(sys.stdin)["exercises"][0]["id"])')
curl -s $B/exercises/$EX/suggestion -H "$H"; echo
S1=$(curl -s -X POST $B/sessions -H "$H" -H "$J" -d "{\"plan_day_id\":\"$DAY\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -s -w ' %{http_code}\n' -X POST $B/sessions -H "$H" -H "$J" -d "{\"plan_day_id\":\"$DAY\"}"
for n in 1 2 3; do curl -s -X POST $B/sessions/$S1/sets -H "$H" -H "$J" -d "{\"day_exercise_id\":\"$EX\",\"set_number\":$n,\"weight_used\":40,\"reps_done\":8,\"effort\":\"easy\",\"extra_segments\":[{\"weight\":30,\"reps\":6}]}"; echo; done
curl -s $B/sessions/active -H "$H"; echo
curl -s -X POST $B/sessions/$S1/finish -H "$H"; echo
curl -s $B/exercises/$EX/suggestion -H "$H"; echo
S2=$(curl -s -X POST $B/sessions -H "$H" -H "$J" -d "{\"plan_day_id\":\"$DAY\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -s -X POST $B/sessions/$S2/sets -H "$H" -H "$J" -d "{\"day_exercise_id\":\"$EX\",\"set_number\":1,\"weight_used\":42.5,\"reps_done\":8,\"effort\":\"ok\"}"; echo
curl -s -X POST $B/sessions/$S2/finish -H "$H" >/dev/null
curl -s $B/exercises/$EX/trend -H "$H"; echo
SET=$(curl -s $B/sessions/$S2 -H "$H" | python3 -c 'import sys,json;print(json.load(sys.stdin)["sets"][0]["id"])')
curl -s -X PATCH $B/sessions/$S2/sets/$SET -H "$H" -H "$J" -d '{"weight_used":45,"reps_done":7,"effort":"hard","extra_segments":[]}'; echo
curl -s $B/sessions -H "$H"; echo
curl -s -w ' %{http_code}\n' -X POST $B/sessions/$S2/sets -H "$H" -H "$J" -d '{"day_exercise_id":"11111111-1111-1111-1111-111111111111","set_number":2,"weight_used":1,"reps_done":1,"effort":"ok"}'
curl -s -X DELETE $B/sessions/$S2 -H "$H"; echo
```
Expected:
- the first suggestion → `{"weight":40,"reason":"Starting weight 40 kg"}`
- the second POST /sessions returns the same id with ` 200`
- the 3 set POSTs return `{"id":…}`; active lists one session with `"set_count":3`
- finish returns `finished_at`; the suggestion is now `{"weight":42.5,"reason":"Last time felt easy → +2.5 kg"}`
- trend → `"exercise_name":"Bench"`, 2 series points, `"label":"progressing"`
- PATCH → `{"id":…}`; history lists 2 sessions, newest first
- the foreign exercise → `{"error":"day_exercise_id does not belong to this session"} 400`; DELETE → `{"success":true}`

Clean up the smoke data: `curl -s -X DELETE $B/plans/$PID -H "$H"`

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/gym
git commit -m "feat(gym): sessions, set logging, suggestion and trend API

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Frontend foundation — types, API client, routing, sidebar, styles, plans list, new plan/import

**Files:**
- Modify: `shared/types.ts` (append Gym types)
- Modify: `frontend/src/api/client.ts` (error messages from the response body; `gym*` functions)
- Create: `frontend/src/hooks/useAsync.ts`
- Create: `frontend/src/pages/gym/nav.ts`, `frontend/src/pages/gym/GymRouter.tsx`
- Create: `frontend/src/pages/gym/GymPlansView.tsx`, `frontend/src/pages/gym/InProgressBanner.tsx`, `frontend/src/pages/gym/GymNewPlanView.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`, `frontend/src/App.tsx`, `frontend/src/styles/global.css`

**Interfaces:**
- Consumes: all `/api/gym/*` endpoints (Tasks 3–4).
- Produces (later tasks rely on these exact names):
  - Types in `@shared/types`: `GymEffort`, `GymPlan`, `GymSegmentTarget`, `GymSegment`, `GymExercise`, `GymExerciseInput`, `GymDay`, `GymPlanTree`, `GymDayDetail`, `GymPlanImport`, `GymSessionRow`, `GymSetLog`, `GymSessionDetail`, `GymSetInput`, `GymNewSet`, `GymSuggestion`, `GymTrendLabel`, `GymTrendPoint`, `GymTrend`.
  - `api.gym*` functions (listed in Step 2).
  - `useAsync<T>(fn, deps) → { data: T | null; loading; error: string | null; reload(): Promise<void>; setData }` and `errorMessage(e: unknown): string` from `hooks/useAsync.ts`.
  - `Navigate = (view: string) => void`, `gymViews`, `parseGymView`, `isGymView`, `gymNavSection` from `pages/gym/nav.ts`.
  - Every gym page takes props `{ onNavigate: Navigate }` plus its id prop(s); `GymRouter` gets one `case` per page (later tasks add theirs).
  - CSS classes: `gym-page`, `gym-title`, `gym-subtitle`, `gym-card`, `gym-row`, `gym-row--between`, `gym-wrap`, `gym-grid-2`, `gym-btn` (`--secondary`, `--danger`, `--block`), `gym-muted`, `gym-cap`, `gym-field`, `gym-check`, `gym-badge` (`--accent`), `gym-effort`, `gym-icon-btn`, `gym-list-row`, `gym-error`, `gym-title-input`, `set-dots` (`.dot`, `.done`, `.current`), `flash-pill`.

- [ ] **Step 1: Append the Gym types to `shared/types.ts`**

```ts
// ── Gym ─────────────────────────────────────────────────────────────────────
export type GymEffort = 'easy' | 'ok' | 'hard' | 'failed';

export interface GymPlan {
  id: string;
  name: string;
  is_active: boolean;
}

export interface GymSegmentTarget { reps: number; }
export interface GymSegment { weight: number; reps: number; }

export interface GymExercise {
  id: string;
  exercise_name: string;
  order_index: number;
  target_sets: number;
  target_reps: number;
  rest_seconds: number | null;
  starting_weight: number | null;
  extra_segments: GymSegmentTarget[];
}

export type GymExerciseInput = Partial<Omit<GymExercise, 'id'>>;

export interface GymDay {
  id: string;
  name: string;
  order_index: number;
  is_superset: boolean;
  exercises: GymExercise[];
}

export interface GymPlanTree extends GymPlan { days: GymDay[]; }

export interface GymDayDetail {
  id: string;
  name: string;
  is_superset: boolean;
  plan_id: string;
  exercises: GymExercise[];
}

export interface GymPlanImport {
  name: string;
  days: Array<{
    name: string;
    is_superset: boolean;
    exercises: Array<Omit<GymExercise, 'id' | 'order_index'>>;
  }>;
}

export interface GymSessionRow {
  id: string;
  plan_day_id: string;
  started_at: string;
  finished_at: string | null;
  day_name: string;
  set_count: number;
}

export interface GymSetLog {
  id: string;
  day_exercise_id: string;
  exercise_name: string;
  set_number: number;
  weight_used: number;
  reps_done: number;
  effort: GymEffort;
  extra_segments: GymSegment[];
  created_at: string;
}

export interface GymSessionDetail {
  id: string;
  plan_day_id: string;
  started_at: string;
  finished_at: string | null;
  day_name: string;
  sets: GymSetLog[];
}

export interface GymSetInput {
  weight_used: number;
  reps_done: number;
  effort: GymEffort;
  extra_segments: GymSegment[];
}

export interface GymNewSet extends GymSetInput {
  day_exercise_id: string;
  set_number: number;
}

export interface GymSuggestion { weight: number | null; reason: string; }

export type GymTrendLabel = 'progressing' | 'steady' | 'regressing' | 'insufficient';
export interface GymTrendPoint { date: string; topWeight: number; bestE1rm: number; }
export interface GymTrend {
  exercise_name: string;
  series: GymTrendPoint[];
  label: GymTrendLabel;
  slope: number;
}
```

- [ ] **Step 2: Update `frontend/src/api/client.ts`**

2a. Replace the line `if (!res.ok) throw new Error(\`API error: ${res.status}\`);` with code that surfaces the server's message (needed so import validation details reach the user; other callers keep getting an `Error`):

```ts
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; details?: string[] } | null;
    throw new Error(body?.error ? [body.error, ...(body.details ?? [])].join('\n') : `API error: ${res.status}`);
  }
```

2b. Extend the type import on line 1 with:
`GymPlan, GymPlanTree, GymPlanImport, GymDayDetail, GymExerciseInput, GymSessionRow, GymSessionDetail, GymNewSet, GymSetInput, GymSuggestion, GymTrend`

2c. Add inside the `api` object, after the Notes block (before the closing `};`):

```ts
  // Gym
  gymPlans: () => request<GymPlan[]>('/gym/plans'),
  gymCreatePlan: (name: string) =>
    request<{ id: string }>('/gym/plans', { method: 'POST', body: JSON.stringify({ name }) }),
  gymImportPlan: (plan: unknown) =>
    request<{ id: string }>('/gym/plans/import', { method: 'POST', body: JSON.stringify(plan) }),
  gymPlan: (id: string) => request<GymPlanTree>(`/gym/plans/${id}`),
  gymUpdatePlan: (id: string, data: { name?: string; is_active?: boolean }) =>
    request<{ id: string }>(`/gym/plans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  gymDeletePlan: (id: string) => request<void>(`/gym/plans/${id}`, { method: 'DELETE' }),
  gymDuplicatePlan: (id: string) => request<{ id: string }>(`/gym/plans/${id}/duplicate`, { method: 'POST' }),
  gymExportPlan: (id: string) => request<GymPlanImport>(`/gym/plans/${id}/export`),
  gymAddDay: (planId: string, name: string) =>
    request<{ id: string }>(`/gym/plans/${planId}/days`, { method: 'POST', body: JSON.stringify({ name }) }),
  gymDay: (dayId: string) => request<GymDayDetail>(`/gym/days/${dayId}`),
  gymUpdateDay: (dayId: string, data: { name?: string; is_superset?: boolean; order_index?: number }) =>
    request<{ id: string }>(`/gym/days/${dayId}`, { method: 'PUT', body: JSON.stringify(data) }),
  gymDeleteDay: (dayId: string) => request<void>(`/gym/days/${dayId}`, { method: 'DELETE' }),
  gymAddExercise: (dayId: string, data: GymExerciseInput) =>
    request<{ id: string }>(`/gym/days/${dayId}/exercises`, { method: 'POST', body: JSON.stringify(data) }),
  gymUpdateExercise: (exId: string, data: GymExerciseInput) =>
    request<{ id: string }>(`/gym/exercises/${exId}`, { method: 'PUT', body: JSON.stringify(data) }),
  gymDeleteExercise: (exId: string) => request<void>(`/gym/exercises/${exId}`, { method: 'DELETE' }),
  gymStartSession: (dayId: string) =>
    request<{ id: string; started_at: string }>('/gym/sessions', { method: 'POST', body: JSON.stringify({ plan_day_id: dayId }) }),
  gymSessions: () => request<GymSessionRow[]>('/gym/sessions'),
  gymActiveSessions: () => request<GymSessionRow[]>('/gym/sessions/active'),
  gymSession: (id: string) => request<GymSessionDetail>(`/gym/sessions/${id}`),
  gymDeleteSession: (id: string) => request<void>(`/gym/sessions/${id}`, { method: 'DELETE' }),
  gymLogSet: (sessionId: string, set: GymNewSet) =>
    request<{ id: string }>(`/gym/sessions/${sessionId}/sets`, { method: 'POST', body: JSON.stringify(set) }),
  gymUpdateSet: (sessionId: string, setId: string, set: GymSetInput) =>
    request<{ id: string }>(`/gym/sessions/${sessionId}/sets/${setId}`, { method: 'PATCH', body: JSON.stringify(set) }),
  gymFinishSession: (id: string) =>
    request<{ id: string; finished_at: string }>(`/gym/sessions/${id}/finish`, { method: 'POST' }),
  gymSuggestion: (exId: string) => request<GymSuggestion>(`/gym/exercises/${exId}/suggestion`),
  gymTrend: (exId: string) => request<GymTrend>(`/gym/exercises/${exId}/trend`),
```

- [ ] **Step 3: Create `frontend/src/hooks/useAsync.ts`**

```ts
import { DependencyList, useCallback, useEffect, useRef, useState } from 'react';

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await run();
      if (id === requestId.current) setData(result);
    } catch (e) {
      if (id === requestId.current) setError(errorMessage(e));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    setData(null);
    reload();
  }, [reload]);

  return { data, loading, error, reload, setData };
}
```

- [ ] **Step 4: Create `frontend/src/pages/gym/nav.ts`**

```ts
export type Navigate = (view: string) => void;

export type GymView =
  | { page: 'plans' }
  | { page: 'new' }
  | { page: 'history' }
  | { page: 'plan'; id: string }
  | { page: 'edit'; id: string }
  | { page: 'session'; dayId: string }
  | { page: 'historyDetail'; id: string }
  | { page: 'historyEdit'; id: string }
  | { page: 'progress'; exerciseId: string };

export const gymViews = {
  plans: 'gym-plans',
  newPlan: 'gym-new',
  history: 'gym-history',
  plan: (id: string) => `gym-plan-${id}`,
  edit: (id: string) => `gym-edit-${id}`,
  session: (dayId: string) => `gym-session-${dayId}`,
  historyDetail: (id: string) => `gym-history-${id}`,
  historyEdit: (id: string) => `gym-history-edit-${id}`,
  progress: (exerciseId: string) => `gym-progress-${exerciseId}`,
};

export const isGymView = (view: string) => view.startsWith('gym-');

// Order matters: 'gym-history-edit-' must be checked before 'gym-history-'.
const PREFIXES: Array<[string, (rest: string) => GymView]> = [
  ['gym-history-edit-', (id) => ({ page: 'historyEdit', id })],
  ['gym-history-', (id) => ({ page: 'historyDetail', id })],
  ['gym-plan-', (id) => ({ page: 'plan', id })],
  ['gym-edit-', (id) => ({ page: 'edit', id })],
  ['gym-session-', (dayId) => ({ page: 'session', dayId })],
  ['gym-progress-', (exerciseId) => ({ page: 'progress', exerciseId })],
];

export function parseGymView(view: string): GymView | null {
  if (view === gymViews.plans) return { page: 'plans' };
  if (view === gymViews.newPlan) return { page: 'new' };
  if (view === gymViews.history) return { page: 'history' };
  for (const [prefix, make] of PREFIXES) {
    if (view.startsWith(prefix) && view.length > prefix.length) return make(view.slice(prefix.length));
  }
  return null;
}

/** Sidebar item to highlight for a gym view. */
export function gymNavSection(view: string): string | null {
  const v = parseGymView(view);
  if (!v) return null;
  if (v.page === 'new') return gymViews.newPlan;
  if (v.page === 'history' || v.page === 'historyDetail' || v.page === 'historyEdit') return gymViews.history;
  return gymViews.plans;
}
```

- [ ] **Step 5: Create `frontend/src/pages/gym/InProgressBanner.tsx`**

```tsx
import { useState } from 'react';
import { api } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { gymViews, Navigate } from './nav';

export function InProgressBanner({ onNavigate }: { onNavigate: Navigate }) {
  const { data: sessions, reload } = useAsync(() => api.gymActiveSessions(), []);
  const [busy, setBusy] = useState(false);

  const discard = async (id: string) => {
    if (!confirm('Discard this in-progress workout?')) return;
    setBusy(true);
    try {
      await api.gymDeleteSession(id);
    } finally {
      setBusy(false);
      reload();
    }
  };

  if (!sessions || sessions.length === 0) return null;
  return (
    <>
      {sessions.map((s) => (
        <div key={s.id} className="gym-card" style={{ borderColor: 'var(--accent)' }}>
          <div>
            <div style={{ fontWeight: 600 }}>⏳ In progress: {s.day_name}</div>
            <div className="gym-muted">
              {s.set_count} sets logged · started {new Date(s.started_at).toLocaleString()}
            </div>
          </div>
          <div className="gym-row">
            <button className="gym-btn" onClick={() => onNavigate(gymViews.session(s.plan_day_id))}>Resume</button>
            <button className="gym-btn gym-btn--danger" disabled={busy} onClick={() => discard(s.id)}>Discard</button>
          </div>
        </div>
      ))}
    </>
  );
}
```

- [ ] **Step 6: Create `frontend/src/pages/gym/GymPlansView.tsx`**

```tsx
import { api } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { InProgressBanner } from './InProgressBanner';
import { gymViews, Navigate } from './nav';

export function GymPlansView({ onNavigate }: { onNavigate: Navigate }) {
  const { data: plans, loading, error } = useAsync(() => api.gymPlans(), []);

  return (
    <div className="gym-page">
      <div className="gym-row gym-row--between">
        <h2 className="gym-title">Gym plans</h2>
        <button className="gym-btn" onClick={() => onNavigate(gymViews.newPlan)}>+ New plan</button>
      </div>
      <InProgressBanner onNavigate={onNavigate} />
      {error && <div className="gym-error">{error}</div>}
      {loading && !plans && <div className="gym-muted">Loading…</div>}
      {plans && plans.length === 0 && (
        <div className="gym-card">
          <div className="gym-muted">No plans yet. Create one from scratch or import a JSON plan.</div>
          <button className="gym-btn" onClick={() => onNavigate(gymViews.newPlan)}>Create or import a plan</button>
        </div>
      )}
      {plans?.map((p) => (
        <button key={p.id} className="gym-list-row" onClick={() => onNavigate(gymViews.plan(p.id))}>
          <span style={{ fontWeight: 500 }}>{p.name}</span>
          {p.is_active && <span className="gym-badge gym-badge--accent">Active</span>}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Create `frontend/src/pages/gym/GymNewPlanView.tsx`**

```tsx
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
```

- [ ] **Step 8: Create `frontend/src/pages/gym/GymRouter.tsx`** (Tasks 6–10 add a `case` each)

```tsx
import { GymNewPlanView } from './GymNewPlanView';
import { GymPlansView } from './GymPlansView';
import { Navigate, parseGymView } from './nav';

export function GymRouter({ view, onNavigate }: { view: string; onNavigate: Navigate }) {
  const v = parseGymView(view);
  if (!v) return <div className="gym-muted">Page not found</div>;
  switch (v.page) {
    case 'plans':
      return <GymPlansView onNavigate={onNavigate} />;
    case 'new':
      return <GymNewPlanView onNavigate={onNavigate} />;
    default:
      return <div className="gym-muted">Page not found</div>;
  }
}
```

- [ ] **Step 9: Wire into `frontend/src/App.tsx`**

Add imports:
```tsx
import { GymRouter } from './pages/gym/GymRouter';
import { isGymView } from './pages/gym/nav';
```
At the top of the `default: {` block in `renderView`, before `if (currentView.startsWith('area-'))`, add:
```tsx
        if (isGymView(currentView)) {
          return <GymRouter key={currentView} view={currentView} onNavigate={setCurrentView} />;
        }
```
(`key` forces a fresh mount per view, so every page starts with clean state.)

- [ ] **Step 10: Add the Gym section to `frontend/src/components/Sidebar.tsx`**

Add the import `import { gymNavSection, gymViews } from '../pages/gym/nav';`.

Above `const navItems = [`, add the shared button style and the gym items:
```tsx
  const navButtonStyle = (active: boolean): React.CSSProperties => ({
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '10px 12px',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: active ? 600 : 400,
    background: active ? 'var(--bg-tertiary)' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
  });

  const gymItems = [
    { id: gymViews.plans, label: 'Plans' },
    { id: gymViews.newPlan, label: 'New plan' },
    { id: gymViews.history, label: 'History' },
  ];
  const gymActive = gymNavSection(currentView);
```
Replace the `style={{ ... }}` object of the existing nav-item button with `style={navButtonStyle(currentView === item.id)}`.

Insert this block between the closing `</nav>` and `<div style={{ padding: '0 16px' }}>` (the Areas section):
```tsx
      <div style={{ padding: '0 16px', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          Gym
        </span>
      </div>
      <nav style={{ padding: '0 8px', marginBottom: 24 }}>
        {gymItems.map(item => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className="nav-item"
            style={navButtonStyle(gymActive === item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
```

- [ ] **Step 11: Append gym styles to the end of `frontend/src/styles/global.css`**

```css
/* ── Gym ─────────────────────────────────────────────────────────────────────── */

.gym-page { max-width: 760px; display: flex; flex-direction: column; gap: 16px; }
.gym-page input:not([type='checkbox']):not([type='file']), .gym-page select { min-width: 0; }
.gym-page select {
  font: inherit; color: inherit; background: var(--bg-tertiary); border: 1px solid var(--border);
  border-radius: 6px; padding: 8px 12px; font-size: 16px;
}
.gym-title { font-size: 24px; font-weight: 600; }
.gym-subtitle { font-size: 16px; font-weight: 600; }
.gym-card {
  background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px;
  padding: 16px; display: flex; flex-direction: column; gap: 12px;
}
.gym-row { display: flex; align-items: center; gap: 8px; }
.gym-row--between { justify-content: space-between; }
.gym-wrap { flex-wrap: wrap; }
.gym-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.gym-btn {
  padding: 8px 14px; border-radius: 6px; background: var(--accent); color: #fff;
  font-size: 14px; font-weight: 500; min-height: 36px;
}
.gym-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.gym-btn--secondary { background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border); }
.gym-btn--danger { background: transparent; color: var(--danger); border: 1px solid var(--danger); }
.gym-btn--block { width: 100%; min-height: 44px; }
.gym-muted { color: var(--text-muted); font-size: 13px; }
.gym-cap { font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--text-muted); }
.gym-field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--text-secondary); }
.gym-field input, .gym-field select { width: 100%; }
.gym-check { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--text-secondary); }
.gym-check input { width: auto; }
.gym-badge {
  font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--bg-tertiary);
  color: var(--text-secondary); border: 1px solid var(--border); white-space: nowrap;
}
.gym-badge--accent { background: var(--accent); color: #fff; border-color: var(--accent); }
.gym-effort { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.gym-effort .gym-btn { min-height: 48px; }
.gym-icon-btn { min-width: 36px; min-height: 36px; border-radius: 6px; color: var(--text-muted); }
.gym-icon-btn:hover { color: var(--text-primary); background: var(--bg-tertiary); }
.gym-list-row {
  display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%;
  padding: 12px 16px; text-align: left; color: var(--text-primary);
  background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px;
}
.gym-error { color: var(--danger); font-size: 13px; white-space: pre-wrap; }
.gym-title-input { font-size: 20px; font-weight: 600; width: 100%; }

.set-dots { display: flex; gap: 6px; }
.set-dots .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--bg-tertiary); border: 1px solid var(--border); }
.set-dots .dot.done { background: var(--success); border-color: var(--success); }
.set-dots .dot.current { background: transparent; border-color: var(--accent); box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.35); }

.flash-pill {
  position: fixed; left: 50%; bottom: calc(24px + var(--safe-bottom)); transform: translateX(-50%);
  background: var(--success); color: #fff; padding: 8px 16px; border-radius: 999px;
  font-weight: 600; z-index: 300; pointer-events: none;
}

@media (max-width: 768px) {
  .gym-effort { grid-template-columns: repeat(2, 1fr); }
}
```

- [ ] **Step 12: Type-check and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: both exit 0.

- [ ] **Step 13: Browser check** (dev stack running; open http://localhost:3000, password `admin`)

- The sidebar shows a "GYM" heading with Plans / New plan / History under the main nav, styled like the other items. The Today/Week header stays visible.
- Plans → "Gym plans" with an empty state (or plans left over from earlier smoke tests).
- New plan → type a name → Create → lands on "Page not found" (the editor arrives in Task 7). Go back to Plans: the plan is listed.
- New plan → import a JSON file such as `{"name":"Imp","days":[{"name":"A","exercises":[]}]}` → lands on "Page not found" (Task 6); Plans lists "Imp". An invalid file (`{"name":""}`) shows `invalid plan`, `name must be a non-empty string` and `days must be an array` on separate lines.
- History → "Page not found" (Task 9).

- [ ] **Step 14: Commit**

```bash
git add shared/types.ts frontend/src
git commit -m "feat(gym): frontend foundation, sidebar section, plans list and import

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Plan detail page

**Files:**
- Create: `frontend/src/pages/gym/GymPlanView.tsx`
- Modify: `frontend/src/pages/gym/GymRouter.tsx`

**Interfaces:**
- Consumes: `api.gymPlan`, `api.gymActiveSessions`, `api.gymUpdatePlan`, `api.gymDuplicatePlan`, `api.gymExportPlan`, `api.gymDeletePlan`; `useAsync`, `errorMessage`; `gymViews`, `Navigate`.
- Produces: `GymPlanView({ planId, onNavigate })`; `describeExercise(ex: GymExercise): string`, exported for reuse.

- [ ] **Step 1: Create `frontend/src/pages/gym/GymPlanView.tsx`**

```tsx
import { useState } from 'react';
import type { GymExercise } from '@shared/types';
import { api } from '../../api/client';
import { errorMessage, useAsync } from '../../hooks/useAsync';
import { gymViews, Navigate } from './nav';

export function describeExercise(ex: GymExercise): string {
  const parts = [`${ex.target_sets} × ${ex.target_reps}`];
  if (ex.extra_segments.length) parts[0] += ` + ${ex.extra_segments.length} drop/up`;
  if (ex.rest_seconds != null) parts.push(`rest ${ex.rest_seconds}s`);
  if (ex.starting_weight != null) parts.push(`start ${ex.starting_weight} kg`);
  return parts.join(' · ');
}

function downloadJson(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function GymPlanView({ planId, onNavigate }: { planId: string; onNavigate: Navigate }) {
  const { data: plan, error, reload } = useAsync(() => api.gymPlan(planId), [planId]);
  const { data: active } = useAsync(() => api.gymActiveSessions(), []);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="gym-page"><div className="gym-error">{error}</div></div>;
  if (!plan) return <div className="gym-muted">Loading…</div>;

  const activeDayIds = new Set((active ?? []).map((s) => s.plan_day_id));

  const exportPlan = () =>
    act(async () => {
      const data = await api.gymExportPlan(plan.id);
      downloadJson(`${plan.name.replace(/[^\w\- ]+/g, '').trim() || 'plan'}.json`, data);
    });
  const deletePlan = () => {
    if (!confirm(`Delete plan "${plan.name}"?`)) return;
    act(async () => {
      await api.gymDeletePlan(plan.id);
      onNavigate(gymViews.plans);
    });
  };

  return (
    <div className="gym-page">
      <div className="gym-row gym-wrap">
        <h2 className="gym-title">{plan.name}</h2>
        {plan.is_active && <span className="gym-badge gym-badge--accent">Active</span>}
      </div>
      <div className="gym-row gym-wrap">
        <button className="gym-btn gym-btn--secondary" onClick={() => onNavigate(gymViews.edit(plan.id))}>Edit</button>
        {!plan.is_active && (
          <button className="gym-btn gym-btn--secondary" disabled={busy}
            onClick={() => act(async () => { await api.gymUpdatePlan(plan.id, { is_active: true }); await reload(); })}>
            Set active
          </button>
        )}
        <button className="gym-btn gym-btn--secondary" disabled={busy}
          onClick={() => act(async () => { const { id } = await api.gymDuplicatePlan(plan.id); onNavigate(gymViews.plan(id)); })}>
          Duplicate
        </button>
        <button className="gym-btn gym-btn--secondary" disabled={busy} onClick={exportPlan}>Export</button>
        <button className="gym-btn gym-btn--danger" disabled={busy} onClick={deletePlan}>Delete</button>
      </div>
      {actionError && <div className="gym-error">{actionError}</div>}
      {plan.days.length === 0 && (
        <div className="gym-card"><div className="gym-muted">This plan has no days yet. Use Edit to add some.</div></div>
      )}
      {plan.days.map((day) => (
        <div key={day.id} className="gym-card">
          <div className="gym-row gym-row--between gym-wrap">
            <div className="gym-row">
              <span className="gym-subtitle">{day.name}</span>
              {day.is_superset && <span className="gym-badge">Superset</span>}
            </div>
            <button className="gym-btn" disabled={day.exercises.length === 0} onClick={() => onNavigate(gymViews.session(day.id))}>
              {activeDayIds.has(day.id) ? 'Resume' : 'Start'}
            </button>
          </div>
          {day.exercises.length === 0 && <div className="gym-muted">No exercises</div>}
          {day.exercises.map((ex) => (
            <div key={ex.id} className="gym-row gym-row--between">
              <div>
                <div>{ex.exercise_name}</div>
                <div className="gym-muted">{describeExercise(ex)}</div>
              </div>
              <button className="gym-icon-btn" title="Progress" onClick={() => onNavigate(gymViews.progress(ex.id))}>📈</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add the route.** In `GymRouter.tsx` add `import { GymPlanView } from './GymPlanView';` and, before `default:`:

```tsx
    case 'plan':
      return <GymPlanView planId={v.id} onNavigate={onNavigate} />;
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Browser check**

- Import a plan with two days, one superset. The plan page shows the days, a "Superset" badge, and exercise lines such as `3 × 8 + 1 drop/up · start 40 kg`.
- Set active → "Active" badge; the Plans list shows only that plan as active.
- Duplicate → opens "<name> (copy)" without the Active badge.
- Export downloads `<name>.json`; re-importing it via New plan produces an identical plan.
- Delete → confirm → back on Plans, and the plan is gone.
- Start → "Page not found" (Task 8); 📈 → "Page not found" (Task 10).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/gym
git commit -m "feat(gym): plan detail page with activate/duplicate/export/delete

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: Plan editor

**Files:**
- Create: `frontend/src/pages/gym/ExerciseEditor.tsx`, `frontend/src/pages/gym/GymPlanEditorView.tsx`
- Modify: `frontend/src/pages/gym/GymRouter.tsx`

**Interfaces:**
- Consumes: `api.gymPlan`, `api.gymUpdatePlan`, `api.gymAddDay`, `api.gymUpdateDay`, `api.gymDeleteDay`, `api.gymAddExercise`, `api.gymUpdateExercise`, `api.gymDeleteExercise`; `useAsync`, `errorMessage`; `gymViews`, `Navigate`.
- Produces: `GymPlanEditorView({ planId, onNavigate })`; `ExerciseEditor({ ex, onSave, onNavigate })`, where `Save = (fn: () => Promise<unknown>) => Promise<void>`.

Editing model, as in the original: inputs are uncontrolled (`defaultValue`) and save on blur. Every save reloads the plan so the props stay current. On failure the error is shown, the plan reloads, and `rev` bumps to remount the inputs with the server values.

- [ ] **Step 1: Create `frontend/src/pages/gym/ExerciseEditor.tsx`**

```tsx
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
```

- [ ] **Step 2: Create `frontend/src/pages/gym/GymPlanEditorView.tsx`**

```tsx
import { useState } from 'react';
import { api } from '../../api/client';
import { errorMessage, useAsync } from '../../hooks/useAsync';
import { ExerciseEditor, Save, TextField } from './ExerciseEditor';
import { gymViews, Navigate } from './nav';

export function GymPlanEditorView({ planId, onNavigate }: { planId: string; onNavigate: Navigate }) {
  const { data: plan, error, reload } = useAsync(() => api.gymPlan(planId), [planId]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rev, setRev] = useState(0);

  const save: Save = async (fn) => {
    setSaveError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setSaveError(errorMessage(e));
      await reload();
      setRev((r) => r + 1);
    }
  };

  if (error) return <div className="gym-page"><div className="gym-error">{error}</div></div>;
  if (!plan) return <div className="gym-muted">Loading…</div>;

  return (
    <div className="gym-page" key={rev}>
      <div className="gym-cap">Editing plan</div>
      <TextField className="gym-title-input" value={plan.name} onCommit={(v) => save(() => api.gymUpdatePlan(plan.id, { name: v }))} />
      {saveError && <div className="gym-error">{saveError}</div>}

      {plan.days.map((day) => (
        <div key={day.id} className="gym-card">
          <div className="gym-row">
            <div style={{ flex: 1 }}>
              <TextField value={day.name} onCommit={(v) => save(() => api.gymUpdateDay(day.id, { name: v }))} />
            </div>
            <button
              className="gym-icon-btn"
              title="Delete day"
              onClick={() => {
                if (confirm(`Delete day "${day.name}" and all its logged workouts?`)) save(() => api.gymDeleteDay(day.id));
              }}
            >
              ✕
            </button>
          </div>
          <label className="gym-check">
            <input
              type="checkbox"
              checked={day.is_superset}
              onChange={(e) => save(() => api.gymUpdateDay(day.id, { is_superset: e.target.checked }))}
            />
            Superset (one set of each exercise per round)
          </label>
          {day.exercises.map((ex) => (
            <ExerciseEditor key={ex.id} ex={ex} onSave={save} onNavigate={onNavigate} />
          ))}
          <button
            className="gym-btn gym-btn--secondary"
            onClick={() => save(() => api.gymAddExercise(day.id, { exercise_name: 'New exercise', target_sets: 3, target_reps: 8 }))}
          >
            + Add exercise
          </button>
        </div>
      ))}

      <button className="gym-btn gym-btn--secondary" onClick={() => save(() => api.gymAddDay(plan.id, 'New day'))}>+ Add day</button>
      <button className="gym-btn gym-btn--block" onClick={() => onNavigate(gymViews.plan(plan.id))}>Done</button>
    </div>
  );
}
```

- [ ] **Step 3: Add the route.** In `GymRouter.tsx` add `import { GymPlanEditorView } from './GymPlanEditorView';` and, before `default:`:

```tsx
    case 'edit':
      return <GymPlanEditorView planId={v.id} onNavigate={onNavigate} />;
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Browser check**

- New plan "Editor test" → Create → lands in the editor.
- + Add day → "New day" appears. Rename it to "Push" and click elsewhere (blur); reload the page and confirm the change persisted.
- Toggle Superset; it stays toggled after navigating away and back.
- + Add exercise → "New exercise", 3 sets × 8 reps. Change it to Bench / 4 / 6 / rest 90 / start weight 60, blurring after each field.
- + drop/up adds a row defaulting to 6. Set it to 4 and blur; ✕ removes it.
- Type `0` in Sets and blur → the field reverts to 4 (no request). Clear Rest and blur → rest becomes empty (null).
- Done → the plan page shows `4 × 6 · rest 90s · start 60 kg` (plus `+ 1 drop/up` if a row was kept).
- Deleting an exercise or day asks for confirmation first, then removes it.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/gym
git commit -m "feat(gym): blur-to-save plan editor

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 8: Workout session runner

**Files:**
- Modify: `frontend/package.json` (add `vitest` devDependency and a `test` script)
- Create: `frontend/src/pages/gym/schedule.ts`, `frontend/tests/schedule.test.ts`
- Create: `frontend/src/pages/gym/ExerciseLogger.tsx`, `frontend/src/pages/gym/GymSessionView.tsx`
- Modify: `frontend/src/pages/gym/GymRouter.tsx`

**Interfaces:**
- Consumes: `api.gymDay`, `api.gymStartSession`, `api.gymSession`, `api.gymLogSet`, `api.gymFinishSession`, `api.gymSuggestion`; `useAsync`, `errorMessage`; `gymViews`, `Navigate`.
- Produces:
  - `ScheduleStep { exercise: GymExercise; setNumber: number }`
  - `buildSchedule(day: { is_superset: boolean; exercises: GymExercise[] }): ScheduleStep[]`
  - `carryWeight(sets, exerciseId): number | null`
  - `completedSets(setNumber, targetSets): number`
  - `ExerciseLogger({ exercise, setNumber, initialWeight, reason, busy, onLog })`
  - `GymSessionView({ dayId, onNavigate })`

- [ ] **Step 1: Add vitest to the frontend**

```bash
cd frontend && npm install -D vitest@^2 && npm pkg set scripts.test="vitest run"
```
Tests live in `frontend/tests/`, outside `src`, so the `tsc` step of `npm run build` never sees them. Vitest reuses `vite.config.ts`, so the `@shared` alias resolves.

- [ ] **Step 2: Write the failing test `frontend/tests/schedule.test.ts`**

```ts
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
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL. Vitest cannot resolve `../src/pages/gym/schedule`.

- [ ] **Step 4: Create `frontend/src/pages/gym/schedule.ts`**

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npm test`
Expected: all PASS.

- [ ] **Step 6: Create `frontend/src/pages/gym/ExerciseLogger.tsx`**

```tsx
import { useState } from 'react';
import type { GymEffort, GymExercise, GymSetInput } from '@shared/types';
import { completedSets } from './schedule';

const EFFORTS: GymEffort[] = ['easy', 'ok', 'hard', 'failed'];
interface Seg { weight: string; reps: string; }
const isNumStr = (s: string) => s.trim() !== '' && Number.isFinite(Number(s));
const isRepsStr = (s: string) => /^\d+$/.test(s.trim());

export function ExerciseLogger({ exercise, setNumber, initialWeight, reason, busy, onLog }: {
  exercise: GymExercise;
  setNumber: number;
  initialWeight: number | null;
  reason: string;
  busy: boolean;
  onLog: (set: GymSetInput) => void;
}) {
  const [weight, setWeight] = useState(initialWeight != null ? String(initialWeight) : '');
  const [reps, setReps] = useState(String(exercise.target_reps));
  const [segments, setSegments] = useState<Seg[]>(() =>
    exercise.extra_segments.map((t) => ({ weight: '', reps: String(t.reps) })));
  const [pendingFail, setPendingFail] = useState(false);
  const [failedReps, setFailedReps] = useState('');

  const done = completedSets(setNumber, exercise.target_sets);
  const canLog = !busy && isNumStr(weight) && isRepsStr(reps);

  const setSegment = (i: number, field: keyof Seg, value: string) =>
    setSegments((prev) => prev.map((s, j) => (j === i ? { ...s, [field]: value } : s)));

  const log = (effort: GymEffort, repsValue: string) =>
    onLog({
      weight_used: Number(weight),
      reps_done: Number(repsValue),
      effort,
      // Rows left without weight or reps are skipped, as in the original app.
      extra_segments: segments
        .filter((s) => isNumStr(s.weight) && isRepsStr(s.reps))
        .map((s) => ({ weight: Number(s.weight), reps: Number(s.reps) })),
    });

  const onEffort = (effort: GymEffort) => {
    if (effort === 'failed') {
      setFailedReps(reps);
      setPendingFail(true);
      return;
    }
    setPendingFail(false);
    log(effort, reps);
  };

  return (
    <div className="gym-card">
      <div className="gym-subtitle">{exercise.exercise_name}</div>
      <div className="gym-muted">
        Set {setNumber}/{exercise.target_sets} · target {exercise.target_reps} reps
        {exercise.rest_seconds != null ? ` · rest ${exercise.rest_seconds}s` : ''}
      </div>
      <div className="set-dots" aria-label={`${done} of ${exercise.target_sets} sets completed`}>
        {Array.from({ length: exercise.target_sets }, (_, i) => (
          <span key={i} className={i < done ? 'dot done' : i === setNumber - 1 ? 'dot current' : 'dot'} />
        ))}
      </div>
      <div>💡 {reason}</div>

      <div className="gym-grid-2">
        <label className="gym-field">
          Weight (0 = bodyweight, −assisted)
          <input type="number" inputMode="decimal" step={0.5} value={weight} onChange={(e) => setWeight(e.target.value)} />
        </label>
        <label className="gym-field">
          Reps done
          <input type="number" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} />
        </label>
      </div>

      {segments.map((s, i) => (
        <div key={i} className="gym-row">
          <input type="number" inputMode="decimal" placeholder="weight" value={s.weight} style={{ flex: 1 }}
            onChange={(e) => setSegment(i, 'weight', e.target.value)} />
          <input type="number" inputMode="numeric" placeholder="reps" value={s.reps} style={{ flex: 1 }}
            onChange={(e) => setSegment(i, 'reps', e.target.value)} />
          <button className="gym-icon-btn" title="Remove" onClick={() => setSegments((prev) => prev.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button className="gym-btn gym-btn--secondary" style={{ alignSelf: 'flex-start' }}
        onClick={() => setSegments((prev) => [...prev, { weight: '', reps: '' }])}>
        + add additional reps &amp; weight
      </button>

      <div className="gym-muted">How did it feel? (tap to log the set)</div>
      <div className="gym-effort">
        {EFFORTS.map((ef) => (
          <button key={ef} className={ef === 'failed' ? 'gym-btn gym-btn--danger' : 'gym-btn'} disabled={!canLog}
            onClick={() => onEffort(ef)}>
            {ef}
          </button>
        ))}
      </div>

      {pendingFail && (
        <div className="gym-card" style={{ background: 'var(--bg-tertiary)' }}>
          <div>How many reps did you complete?</div>
          <input type="number" inputMode="numeric" placeholder="reps completed" value={failedReps}
            onChange={(e) => setFailedReps(e.target.value)} />
          <div className="gym-row">
            <button className="gym-btn" disabled={!canLog || !isRepsStr(failedReps)}
              onClick={() => { setPendingFail(false); log('failed', failedReps); }}>
              Confirm
            </button>
            <button className="gym-btn gym-btn--secondary" onClick={() => setPendingFail(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Create `frontend/src/pages/gym/GymSessionView.tsx`**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GymDayDetail, GymSetInput, GymSetLog } from '@shared/types';
import { api } from '../../api/client';
import { errorMessage, useAsync } from '../../hooks/useAsync';
import { ExerciseLogger } from './ExerciseLogger';
import { gymViews, Navigate } from './nav';
import { buildSchedule, carryWeight } from './schedule';

interface Loaded { day: GymDayDetail; sessionId: string; sets: GymSetLog[]; }

export function GymSessionView({ dayId, onNavigate }: { dayId: string; onNavigate: Navigate }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flashKey, setFlashKey] = useState(0);
  const [flashOn, setFlashOn] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // StrictMode runs effects twice in dev; the ref keeps us to a single start request.
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const day = await api.gymDay(dayId);
        const { id } = await api.gymStartSession(dayId);
        const session = await api.gymSession(id);
        setLoaded({ day, sessionId: id, sets: session.sets });
        setStep(session.sets.length);
      } catch (e) {
        setError(errorMessage(e));
      }
    })();
  }, [dayId]);

  useEffect(() => {
    if (!flashKey) return;
    setFlashOn(true);
    const t = setTimeout(() => setFlashOn(false), 1200);
    return () => clearTimeout(t);
  }, [flashKey]);

  const day = loaded?.day;
  const schedule = useMemo(() => (day ? buildSchedule(day) : []), [day]);
  const current = step < schedule.length ? schedule[step] : null;
  const exId = current?.exercise.id ?? null;
  // Tag the suggestion with its exercise id so a stale one never seeds the next exercise's logger.
  const suggestion = useAsync(
    async () => (exId ? { exId, ...(await api.gymSuggestion(exId)) } : null),
    [exId],
  );

  if (!loaded) {
    return error
      ? <div className="gym-page"><div className="gym-error">{error}</div></div>
      : <div className="gym-muted">Starting workout…</div>;
  }
  const { sessionId, sets } = loaded;

  const log = async (input: GymSetInput) => {
    if (!current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const set = { ...input, day_exercise_id: current.exercise.id, set_number: current.setNumber };
      const { id } = await api.gymLogSet(sessionId, set);
      const logged: GymSetLog = { ...set, id, exercise_name: current.exercise.exercise_name, created_at: new Date().toISOString() };
      setLoaded({ ...loaded, sets: [...sets, logged] });
      setStep((s) => s + 1);
      setFlashKey((k) => k + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      await api.gymFinishSession(sessionId);
      onNavigate(gymViews.plans);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const endEarly = () => {
    if (confirm('End this workout now? Logged sets are kept.')) finish();
  };

  const sug = suggestion.data && suggestion.data.exId === exId ? suggestion.data : null;

  return (
    <div className="gym-page">
      <div className="gym-row gym-wrap">
        <h2 className="gym-title">{loaded.day.name}</h2>
        {loaded.day.is_superset && <span className="gym-badge">Superset</span>}
      </div>
      {schedule.length > 0 && (
        <div className="gym-muted">
          Step {Math.min(step + 1, schedule.length)} of {schedule.length}
          {loaded.day.is_superset && current ? ` · round ${current.setNumber}` : ''}
        </div>
      )}
      {error && <div className="gym-error">{error}</div>}
      {current ? (
        sug ? (
          <ExerciseLogger
            key={step}
            exercise={current.exercise}
            setNumber={current.setNumber}
            initialWeight={carryWeight(sets, current.exercise.id) ?? sug.weight}
            reason={sug.reason}
            busy={busy}
            onLog={log}
          />
        ) : suggestion.error ? (
          <div className="gym-error">{suggestion.error}</div>
        ) : (
          <div className="gym-muted">Loading…</div>
        )
      ) : (
        <div className="gym-card">
          <div className="gym-subtitle">Session complete 💪</div>
          <div className="gym-muted">{sets.length} sets logged</div>
          <button className="gym-btn gym-btn--block" disabled={busy} onClick={finish}>Finish &amp; save</button>
        </div>
      )}
      {current && (
        <button className="gym-btn gym-btn--secondary" disabled={busy} onClick={endEarly}>End session early</button>
      )}
      {flashOn && <div className="flash-pill">✓ Set logged</div>}
    </div>
  );
}
```

- [ ] **Step 8: Add the route.** In `GymRouter.tsx` add `import { GymSessionView } from './GymSessionView';` and, before `default:`:

```tsx
    case 'session':
      return <GymSessionView dayId={v.dayId} onNavigate={onNavigate} />;
```

- [ ] **Step 9: Type-check, test and build**

Run: `cd frontend && npm test && npx tsc --noEmit && npm run build`
Expected: all exit 0.

- [ ] **Step 10: Browser check.** Rebuild the frontend container first so it picks up the new dependency: `docker compose up -d --build frontend`.

- Use a plan with a normal day (Bench 2×8, start 40) and a superset day (A 2×5, B 3×5).
- **Normal day, Start:**
  - The page shows "Step 1 of 2", 2 dots (the first one current), `💡 Starting weight 40 kg`, weight 40 and reps 8.
  - Tap `easy` → "✓ Set logged" for about 1.2 s, then step 2 with weight 40 carried forward and the first dot green.
- **Mid-session resume:**
  - Go to Plans: the banner shows "⏳ In progress: <day>" and "1 sets logged".
  - Resume returns to step 2.
- **Failed set:**
  - `failed` asks "How many reps did you complete?". Cancel hides the prompt.
  - Run it again and Confirm with 6 → "Session complete 💪" → Finish & save → Plans, and the banner is gone.
- **Next workout:** Start the day again. The suggestion is `Deload −2.5 kg (missed reps / failed a set)` with 37.5.
- **Superset day:** the order is A, B, A, B, A, B (6 steps; every exercise appears in every round, as in the original). The header shows "· round N".
- **Input checks:**
  - Clearing the weight disables the effort buttons.
  - A drop/up row with an empty weight is skipped when the set is logged.
- **End session early:** confirm → Plans.
- **Discard:** in the banner, Discard asks for confirmation, then removes the in-progress session.

- [ ] **Step 11: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/pages/gym frontend/tests
git commit -m "feat(gym): workout session runner with suggestions, supersets and resume

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 9: History — list, detail, edit

**Files:**
- Create: `frontend/src/pages/gym/setFormat.ts`, `frontend/tests/setFormat.test.ts`
- Create: `frontend/src/pages/gym/GymHistoryView.tsx`, `frontend/src/pages/gym/GymSessionDetailView.tsx`, `frontend/src/pages/gym/GymSessionEditView.tsx`
- Modify: `frontend/src/pages/gym/GymRouter.tsx`

**Interfaces:**
- Consumes: `api.gymSessions`, `api.gymSession`, `api.gymDeleteSession`, `api.gymUpdateSet`; `useAsync`, `errorMessage`; `gymViews`, `Navigate`.
- Produces:
  - `formatSetLine(weight: number, reps: number, effort: string): string`
  - `formatSegment(weight: number, reps: number): string`
  - `groupByExercise<T extends { exercise_name: string }>(sets: T[]): Array<[string, T[]]>`
  - `GymHistoryView({ onNavigate })`
  - `GymSessionDetailView({ sessionId, onNavigate })`
  - `GymSessionEditView({ sessionId, onNavigate })`

- [ ] **Step 1: Write the failing test `frontend/tests/setFormat.test.ts`**

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL. Vitest cannot resolve `../src/pages/gym/setFormat`.

- [ ] **Step 3: Create `frontend/src/pages/gym/setFormat.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test`
Expected: all PASS.

- [ ] **Step 5: Create `frontend/src/pages/gym/GymHistoryView.tsx`**

```tsx
import { api } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { gymViews, Navigate } from './nav';

export function GymHistoryView({ onNavigate }: { onNavigate: Navigate }) {
  const { data: sessions, loading, error, reload } = useAsync(() => api.gymSessions(), []);

  const remove = async (id: string) => {
    if (!confirm('Delete this session?')) return;
    await api.gymDeleteSession(id);
    reload();
  };

  return (
    <div className="gym-page">
      <h2 className="gym-title">Workout history</h2>
      {error && <div className="gym-error">{error}</div>}
      {loading && !sessions && <div className="gym-muted">Loading…</div>}
      {sessions?.length === 0 && <div className="gym-card"><div className="gym-muted">No finished sessions yet.</div></div>}
      {sessions?.map((s) => (
        <div key={s.id} className="gym-list-row">
          <button style={{ flex: 1, textAlign: 'left' }} onClick={() => onNavigate(gymViews.historyDetail(s.id))}>
            <div style={{ fontWeight: 500 }}>{s.day_name}</div>
            <div className="gym-muted">{new Date(s.finished_at!).toLocaleString()} · {s.set_count} sets</div>
          </button>
          <button className="gym-btn gym-btn--danger" onClick={() => remove(s.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Create `frontend/src/pages/gym/GymSessionDetailView.tsx`**

```tsx
import { api } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { gymViews, Navigate } from './nav';
import { formatSegment, formatSetLine, groupByExercise } from './setFormat';

export function GymSessionDetailView({ sessionId, onNavigate }: { sessionId: string; onNavigate: Navigate }) {
  const { data: session, error } = useAsync(() => api.gymSession(sessionId), [sessionId]);

  if (error) return <div className="gym-page"><div className="gym-error">{error}</div></div>;
  if (!session) return <div className="gym-muted">Loading…</div>;

  return (
    <div className="gym-page">
      <div className="gym-row gym-row--between">
        <h2 className="gym-title">{session.day_name}</h2>
        <button className="gym-btn gym-btn--secondary" onClick={() => onNavigate(gymViews.historyEdit(session.id))}>Edit</button>
      </div>
      {session.finished_at && <div className="gym-muted">{new Date(session.finished_at).toLocaleString()}</div>}
      {session.sets.length === 0 && <div className="gym-card"><div className="gym-muted">No sets logged.</div></div>}
      {groupByExercise(session.sets).map(([name, sets]) => (
        <div key={name} className="gym-card">
          <div className="gym-row gym-row--between">
            <span className="gym-subtitle">{name}</span>
            <button className="gym-icon-btn" title="Progress" onClick={() => onNavigate(gymViews.progress(sets[0].day_exercise_id))}>📈</button>
          </div>
          {sets.map((s) => (
            <div key={s.id}>
              <div>Set {s.set_number}: {formatSetLine(s.weight_used, s.reps_done, s.effort)}</div>
              {s.extra_segments.length > 0 && (
                <div className="gym-muted">+ {s.extra_segments.map((x) => formatSegment(x.weight, x.reps)).join(', ')}</div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Create `frontend/src/pages/gym/GymSessionEditView.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import type { GymEffort } from '@shared/types';
import { api } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { gymViews, Navigate } from './nav';
import { groupByExercise } from './setFormat';

const EFFORTS: GymEffort[] = ['easy', 'ok', 'hard', 'failed'];
interface Draft { weight: string; reps: string; effort: GymEffort; segments: Array<{ weight: string; reps: string }>; }

export function GymSessionEditView({ sessionId, onNavigate }: { sessionId: string; onNavigate: Navigate }) {
  const { data: session, error: loadError, reload } = useAsync(() => api.gymSession(sessionId), [sessionId]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const seeded = useRef(false);

  useEffect(() => {
    if (!session || seeded.current) return;
    seeded.current = true;
    const d: Record<string, Draft> = {};
    for (const s of session.sets) {
      d[s.id] = {
        weight: String(s.weight_used),
        reps: String(s.reps_done),
        effort: s.effort,
        segments: s.extra_segments.map((x) => ({ weight: String(x.weight), reps: String(x.reps) })),
      };
    }
    setDrafts(d);
  }, [session]);

  const upd = (setId: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [setId]: { ...prev[setId], ...patch } }));
  const updSeg = (setId: string, i: number, field: 'weight' | 'reps', value: string) =>
    setDrafts((prev) => ({
      ...prev,
      [setId]: { ...prev[setId], segments: prev[setId].segments.map((sg, j) => (j === i ? { ...sg, [field]: value } : sg)) },
    }));

  const save = async () => {
    if (!session) return;
    const invalid = session.sets.some((s) => {
      const d = drafts[s.id];
      return !d || d.weight.trim() === '' || d.reps.trim() === '';
    });
    if (invalid) { setError('Weight and reps are required for every set.'); return; }
    setSaving(true);
    setError('');
    try {
      for (const s of session.sets) {
        const d = drafts[s.id];
        await api.gymUpdateSet(session.id, s.id, {
          weight_used: Number(d.weight),
          reps_done: Number(d.reps),
          effort: d.effort,
          extra_segments: d.segments
            .filter((x) => x.weight !== '' && x.reps !== '')
            .map((x) => ({ weight: Number(x.weight), reps: Number(x.reps) })),
        });
      }
      onNavigate(gymViews.historyDetail(session.id));
    } catch {
      await reload();
      setError('Some changes may not have been saved. Please review and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loadError) return <div className="gym-page"><div className="gym-error">{loadError}</div></div>;
  if (!session) return <div className="gym-muted">Loading…</div>;

  return (
    <div className="gym-page">
      <h2 className="gym-title">Edit — {session.day_name}</h2>
      {groupByExercise(session.sets).map(([name, sets]) => (
        <div key={name} className="gym-card">
          <span className="gym-subtitle">{name}</span>
          {sets.map((s) => {
            const d = drafts[s.id];
            if (!d) return null;
            return (
              <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="gym-muted">Set {s.set_number}</div>
                <div className="gym-row" style={{ alignItems: 'flex-end' }}>
                  <label className="gym-field" style={{ flex: 1 }}>
                    Weight
                    <input type="number" inputMode="decimal" step={0.5} value={d.weight} onChange={(e) => upd(s.id, { weight: e.target.value })} />
                  </label>
                  <label className="gym-field" style={{ flex: 1 }}>
                    Reps
                    <input type="number" inputMode="numeric" value={d.reps} onChange={(e) => upd(s.id, { reps: e.target.value })} />
                  </label>
                  <label className="gym-field" style={{ flex: 1 }}>
                    Effort
                    <select value={d.effort} onChange={(e) => upd(s.id, { effort: e.target.value as GymEffort })}>
                      {EFFORTS.map((ef) => <option key={ef} value={ef}>{ef}</option>)}
                    </select>
                  </label>
                </div>
                {d.segments.map((sg, i) => (
                  <div key={i} className="gym-row">
                    <input type="number" placeholder="weight" value={sg.weight} style={{ flex: 1 }}
                      onChange={(e) => updSeg(s.id, i, 'weight', e.target.value)} />
                    <input type="number" inputMode="numeric" placeholder="reps" value={sg.reps} style={{ flex: 1 }}
                      onChange={(e) => updSeg(s.id, i, 'reps', e.target.value)} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ))}
      {error && <div className="gym-error">{error}</div>}
      <div className="gym-row">
        <button className="gym-btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        <button className="gym-btn gym-btn--secondary" onClick={() => onNavigate(gymViews.historyDetail(session.id))}>Cancel</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Add the routes.** In `GymRouter.tsx` add these imports:

```tsx
import { GymHistoryView } from './GymHistoryView';
import { GymSessionDetailView } from './GymSessionDetailView';
import { GymSessionEditView } from './GymSessionEditView';
```
Add before `default:`:
```tsx
    case 'history':
      return <GymHistoryView onNavigate={onNavigate} />;
    case 'historyDetail':
      return <GymSessionDetailView sessionId={v.id} onNavigate={onNavigate} />;
    case 'historyEdit':
      return <GymSessionEditView sessionId={v.id} onNavigate={onNavigate} />;
```

- [ ] **Step 9: Type-check, test and build**

Run: `cd frontend && npm test && npx tsc --noEmit && npm run build`
Expected: all exit 0.

- [ ] **Step 10: Browser check**

- Sidebar → Gym History lists finished sessions newest first, each with its date and set count. The sidebar highlights History.
- Open a session to see sets grouped by exercise, e.g. `Set 1: 40 kg × 8 (easy)`, with drop/ups shown as `+ 30×6`.
- Edit: change a weight and set the effort to `hard` → Save → the detail page reflects the change.
- Edit: clear a reps field → Save → "Weight and reps are required for every set."
- Delete a session from the list → confirm → it's gone.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/pages/gym frontend/tests
git commit -m "feat(gym): workout history list, detail and edit

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 10: Exercise progress page

**Files:**
- Modify: `frontend/package.json` (add `recharts`)
- Create: `frontend/src/pages/gym/TrendBadge.tsx`, `frontend/src/pages/gym/GymProgressView.tsx`
- Modify: `frontend/src/pages/gym/GymRouter.tsx`

**Interfaces:**
- Consumes: `api.gymTrend`; `useAsync`; `Navigate`.
- Produces: `TrendBadge({ label: GymTrendLabel })` and `GymProgressView({ exerciseId, onNavigate })`.

- [ ] **Step 1: Install recharts**

Run: `cd frontend && npm install recharts@^2`

- [ ] **Step 2: Create `frontend/src/pages/gym/TrendBadge.tsx`**

```tsx
import type { GymTrendLabel } from '@shared/types';

const MAP: Record<GymTrendLabel, { icon: string; text: string; color: string }> = {
  progressing: { icon: '▲', text: 'Progressing', color: 'var(--success)' },
  steady: { icon: '▬', text: 'Steady', color: 'var(--text-secondary)' },
  regressing: { icon: '▼', text: 'Regressing', color: 'var(--danger)' },
  insufficient: { icon: '•', text: 'Not enough data yet', color: 'var(--text-muted)' },
};

export function TrendBadge({ label }: { label: GymTrendLabel }) {
  const m = MAP[label];
  return <span style={{ color: m.color, fontWeight: 700 }}>{m.icon} {m.text}</span>;
}
```

- [ ] **Step 3: Create `frontend/src/pages/gym/GymProgressView.tsx`**

Recharts sets colours as SVG attributes, where CSS `var()` doesn't resolve, so the hex values of the dashboard palette are used directly.

```tsx
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { Navigate } from './nav';
import { TrendBadge } from './TrendBadge';

const C = { success: '#10b981', accent: '#6366f1', muted: '#64748b', border: '#2d2d4a', bg: '#1a1a2e', text: '#e2e8f0' };
const round1 = (n: number) => Math.round(n * 10) / 10;

export function GymProgressView({ exerciseId }: { exerciseId: string; onNavigate: Navigate }) {
  const { data: trend, error } = useAsync(() => api.gymTrend(exerciseId), [exerciseId]);

  if (error) return <div className="gym-page"><div className="gym-error">{error}</div></div>;
  if (!trend) return <div className="gym-muted">Loading…</div>;

  const data = trend.series.map((p) => ({
    label: new Date(p.date).toLocaleDateString(),
    topWeight: p.topWeight,
    bestE1rm: round1(p.bestE1rm),
  }));

  return (
    <div className="gym-page">
      <h2 className="gym-title">{trend.exercise_name}</h2>
      <div className="gym-card"><TrendBadge label={trend.label} /></div>
      <div className="gym-card" style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke={C.muted} fontSize={11} />
            <YAxis stroke={C.muted} fontSize={11} domain={['auto', 'auto']} />
            <Tooltip contentStyle={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="topWeight" name="Top weight" stroke={C.success} strokeWidth={2} dot />
            <Line type="monotone" dataKey="bestE1rm" name="Est. 1RM" stroke={C.accent} strokeWidth={2} dot />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="gym-card">
        <span className="gym-subtitle">Recent sessions</span>
        {data.length === 0 && <div className="gym-muted">No finished sessions for this exercise yet.</div>}
        {[...data].reverse().map((p, i) => (
          <div key={i} className="gym-row gym-row--between">
            <span>{p.label}</span>
            <span>{p.topWeight} kg <span className="gym-muted">· e1RM {p.bestE1rm}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}
```
`onNavigate` stays in the props type so every gym page has the same signature. It isn't destructured, because `noUnusedParameters` would reject an unused binding.

- [ ] **Step 4: Add the route.** In `GymRouter.tsx` add `import { GymProgressView } from './GymProgressView';` and, before `default:`:

```tsx
    case 'progress':
      return <GymProgressView exerciseId={v.exerciseId} onNavigate={onNavigate} />;
```
Keep the `default:` branch; it still covers unknown views.

- [ ] **Step 5: Type-check, test and build**

Run: `cd frontend && npm test && npx tsc --noEmit && npm run build`
Expected: all exit 0. A Vite chunk-size warning is acceptable.

- [ ] **Step 6: Browser check** (`docker compose up -d --build frontend` first, so the container installs recharts)

- 📈 on an exercise with 2 or more finished sessions shows a line chart in the dark theme: green top weight, indigo e1RM, dark tooltip. The trend badge reads, e.g., "▲ Progressing", and the recent sessions are listed newest first.
- An exercise without history shows "• Not enough data yet" and "No finished sessions for this exercise yet."
- On a mobile-width viewport (DevTools, 390px), the chart fits the screen and the effort buttons wrap to 2 columns.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/pages/gym
git commit -m "feat(gym): exercise progress chart and trend badge

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 11: One-off data migration script

**Files:**
- Create: `scripts/migrate-gym-data.sh` (executable)

**Interfaces:**
- Consumes: the source gym-and-food schema (`users`, `plans`, `plan_days`, `day_exercises`, `workout_sessions`, `set_logs`) and the target `gym_*` tables (Task 1).
- Produces: the command `scripts/migrate-gym-data.sh <gym-login>`. It is idempotent and keeps the original UUIDs.

- [ ] **Step 1: Create `scripts/migrate-gym-data.sh`**

```bash
#!/usr/bin/env bash
# One-off copy of a gym-and-food user's data into progress-dashboard's gym_* tables.
#
# Usage (on the VM, from /opt/progress-app):  scripts/migrate-gym-data.sh <gym-login>
#
# Copies the user's plans (including templates and soft-deleted plans, so history stays
# resolvable), their days and exercises, the user's sessions and their set logs.
# Original UUIDs are kept and existing ids are skipped, so re-running is safe.
#
# Env overrides: GYM_DB_CONTAINER (gym-tracker-db-1), GYM_DB_USER (gym), GYM_DB_NAME (gym),
#   PROGRESS_DB_CONTAINER (db service of docker-compose.prod.yml), PROGRESS_DB_USER (progress),
#   PROGRESS_DB_NAME (progress)
set -euo pipefail

LOGIN="${1:?usage: $0 <gym-login>}"
GYM_DB_CONTAINER="${GYM_DB_CONTAINER:-gym-tracker-db-1}"
GYM_DB_USER="${GYM_DB_USER:-gym}"
GYM_DB_NAME="${GYM_DB_NAME:-gym}"
PROGRESS_DB_CONTAINER="${PROGRESS_DB_CONTAINER:-$(docker compose -f docker-compose.prod.yml ps -q db 2>/dev/null || true)}"
PROGRESS_DB_USER="${PROGRESS_DB_USER:-progress}"
PROGRESS_DB_NAME="${PROGRESS_DB_NAME:-progress}"

die() { echo "error: $*" >&2; exit 1; }
[ -n "$PROGRESS_DB_CONTAINER" ] || die "progress db container not found; set PROGRESS_DB_CONTAINER"

src() { docker exec -i "$GYM_DB_CONTAINER" psql -X -q -v ON_ERROR_STOP=1 -U "$GYM_DB_USER" -d "$GYM_DB_NAME" "$@"; }
dst() { docker exec -i "$PROGRESS_DB_CONTAINER" psql -X -q -v ON_ERROR_STOP=1 -U "$PROGRESS_DB_USER" -d "$PROGRESS_DB_NAME" "$@"; }

seg_type=$(src -tAc "select data_type from information_schema.columns where table_name = 'day_exercises' and column_name = 'extra_segments'")
[ "$seg_type" = "jsonb" ] || die "source day_exercises.extra_segments is '$seg_type' (expected jsonb); apply gym-and-food db/migrations/2026-11-06-extra-segment-reps.sql first"

[ "$(dst -tAc "select to_regclass('public.gym_set_logs') is not null")" = "t" ] \
  || die "gym_* tables missing in the progress db; apply database/migrations/add_gym.sql first"

USER_ID=$(src -tA -v login="$LOGIN" <<'SQL'
select id from users where lower(login) = lower(:'login');
SQL
)
[ -n "$USER_ID" ] || die "no gym user with login '$LOGIN'"
echo "Migrating gym data for '$LOGIN' ($USER_ID)"

# Plans owned by the user, plus any plan the user's sessions or set logs point at.
CTE="with s as (select id, plan_day_id from workout_sessions where user_id = '$USER_ID'),
p as (
  select id from plans where user_id = '$USER_ID'
  union select d.plan_id from s join plan_days d on d.id = s.plan_day_id
  union select d.plan_id from set_logs l join s on s.id = l.session_id
        join day_exercises e on e.id = l.day_exercise_id join plan_days d on d.id = e.plan_day_id
)"

dst <<'SQL'
drop schema if exists gym_import cascade;
create schema gym_import;
create table gym_import.plans (id uuid, name text, is_active boolean, deleted_at timestamptz);
create table gym_import.days (id uuid, plan_id uuid, name text, order_index int, is_superset boolean);
create table gym_import.exercises (id uuid, plan_day_id uuid, exercise_name text, order_index int, target_sets int,
  target_reps int, rest_seconds int, starting_weight numeric, extra_segments jsonb);
create table gym_import.sessions (id uuid, plan_day_id uuid, started_at timestamptz, finished_at timestamptz);
create table gym_import.sets (id uuid, session_id uuid, day_exercise_id uuid, set_number int, weight_used numeric,
  reps_done int, effort text, extra_segments jsonb, created_at timestamptz);
SQL

copy_table() {
  src -c "copy ($2) to stdout with csv" | dst -c "copy gym_import.$1 from stdin with csv"
}
copy_table plans "$CTE select id, name, is_active, deleted_at from plans where id in (select id from p)"
copy_table days "$CTE select id, plan_id, name, order_index, is_superset from plan_days where plan_id in (select id from p)"
copy_table exercises "$CTE select e.id, e.plan_day_id, e.exercise_name, e.order_index, e.target_sets, e.target_reps,
  e.rest_seconds, e.starting_weight, e.extra_segments
  from day_exercises e join plan_days d on d.id = e.plan_day_id where d.plan_id in (select id from p)"
copy_table sessions "select id, plan_day_id, started_at, finished_at from workout_sessions where user_id = '$USER_ID'"
copy_table sets "select l.id, l.session_id, l.day_exercise_id, l.set_number, l.weight_used, l.reps_done, l.effort,
  l.extra_segments, l.created_at
  from set_logs l join workout_sessions s on s.id = l.session_id where s.user_id = '$USER_ID'"

dst <<'SQL'
\echo 'Rows read from the gym db:'
select (select count(*) from gym_import.plans) as plans, (select count(*) from gym_import.days) as days,
       (select count(*) from gym_import.exercises) as exercises, (select count(*) from gym_import.sessions) as sessions,
       (select count(*) from gym_import.sets) as sets;

begin;
insert into gym_plans (id, name, is_active, deleted_at)
  select id, name, is_active and deleted_at is null, deleted_at from gym_import.plans
  on conflict (id) do nothing;
insert into gym_plan_days (id, plan_id, name, order_index, is_superset)
  select id, plan_id, name, order_index, is_superset from gym_import.days
  on conflict (id) do nothing;
insert into gym_day_exercises (id, plan_day_id, exercise_name, order_index, target_sets, target_reps,
                               rest_seconds, starting_weight, extra_segments)
  select id, plan_day_id, exercise_name, order_index, target_sets, target_reps, rest_seconds, starting_weight,
         extra_segments from gym_import.exercises
  on conflict (id) do nothing;
insert into gym_sessions (id, plan_day_id, started_at, finished_at)
  select id, plan_day_id, started_at, finished_at from gym_import.sessions
  on conflict (id) do nothing;
insert into gym_set_logs (id, session_id, day_exercise_id, set_number, weight_used, reps_done, effort,
                          extra_segments, created_at)
  select id, session_id, day_exercise_id, set_number, weight_used, reps_done, effort::gym_effort,
         extra_segments, created_at from gym_import.sets
  on conflict (id) do nothing;
-- Keep a single active plan; a plan that was already active in the dashboard wins.
update gym_plans set is_active = false
 where is_active and id <> (
   select id from gym_plans where is_active
    order by (id in (select id from gym_import.plans)), created_at, name limit 1);
commit;

\echo 'Gym rows now in the progress db:'
select (select count(*) from gym_plans) as plans, (select count(*) from gym_plan_days) as days,
       (select count(*) from gym_day_exercises) as exercises, (select count(*) from gym_sessions) as sessions,
       (select count(*) from gym_set_logs) as sets;
drop schema gym_import cascade;
SQL
echo "Done."
```

Then: `chmod +x scripts/migrate-gym-data.sh`

- [ ] **Step 2: Local end-to-end test with a throwaway source DB.** The dev stack must be running.

```bash
docker run -d --name gymsrc -e POSTGRES_USER=gym -e POSTGRES_PASSWORD=gym -e POSTGRES_DB=gym \
  -v "$PWD/../gym-and-food/db/schema.sql:/docker-entrypoint-initdb.d/schema.sql:ro" postgres:16
until docker exec gymsrc pg_isready -U gym -d gym >/dev/null 2>&1; do sleep 1; done; sleep 2
docker exec -i gymsrc psql -v ON_ERROR_STOP=1 -U gym -d gym <<'SQL'
insert into users (id, login, password_hash) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Tester', 'x'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'other', 'x');
insert into plans (id, user_id, name, is_active) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Migrated PPL', true),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'Not mine', false);
insert into plan_days (id, plan_id, name, order_index, is_superset) values
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Push', 0, false);
insert into day_exercises (id, plan_day_id, exercise_name, order_index, target_sets, target_reps, starting_weight, extra_segments) values
  ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'Bench', 0, 3, 8, 40, '[{"reps":6}]');
insert into workout_sessions (id, user_id, plan_day_id, started_at, finished_at) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', now() - interval '1 hour', now());
insert into set_logs (id, session_id, day_exercise_id, set_number, weight_used, reps_done, effort, extra_segments) values
  ('ffffffff-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 1, 42.5, 8, 'easy', '[{"weight":30,"reps":6}]');
SQL
for i in 1 2; do GYM_DB_CONTAINER=gymsrc PROGRESS_DB_CONTAINER=$(docker compose ps -q db) scripts/migrate-gym-data.sh tester; done
```
Expected:
- Both runs print "Rows read" counts of `1 | 1 | 1 | 1 | 1`.
- The "now in the progress db" totals are the same after both runs (no duplicates).
- In the browser, Gym Plans shows "Migrated PPL" (active, unless another plan was already active). Its 📈 page shows one point at 42.5 kg. History shows the session with `Set 1: 42.5 kg × 8 (easy)` and `+ 30×6`.
- "Not mine" is not imported.

- [ ] **Step 3: Negative checks**

```bash
GYM_DB_CONTAINER=gymsrc PROGRESS_DB_CONTAINER=$(docker compose ps -q db) scripts/migrate-gym-data.sh nobody; echo "exit=$?"
```
Expected: `error: no gym user with login 'nobody'` and `exit=1`.

- [ ] **Step 4: Clean up the test data**

```bash
docker rm -f gymsrc
docker compose exec -T db psql -U progress -d progress -c "delete from gym_plans where id = 'bbbbbbbb-0000-0000-0000-000000000001'"
```
The delete cascades to its days, exercises, sessions and set logs.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-gym-data.sh
git commit -m "feat(gym): one-off migration script from the gym-and-food database

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 12: Final verification and hand-off

**Files:** none, unless a check fails.

- [ ] **Step 1: Full automated checks**

```bash
(cd backend && npm test && npx tsc --noEmit) && (cd frontend && npm test && npx tsc --noEmit && npm run build)
```
Expected: everything exits 0.

- [ ] **Step 2: Production images build**

```bash
docker compose -f docker-compose.prod.yml build backend frontend
```
Expected: both images build. This catches `Dockerfile.prod` problems with the new dependencies and the shared types.

- [ ] **Step 3: Fresh-DB check.** `init.sql` must create the gym tables on an empty volume.

```bash
docker run --rm -d --name initcheck -e POSTGRES_USER=progress -e POSTGRES_PASSWORD=x -e POSTGRES_DB=progress \
  -v "$PWD/database/init.sql:/docker-entrypoint-initdb.d/init.sql:ro" postgres:16-alpine
sleep 6; docker exec initcheck psql -U progress -d progress -c '\dt gym_*'
docker exec -i initcheck psql -v ON_ERROR_STOP=1 -U progress -d progress < database/migrations/add_gym.sql && echo idempotent
docker rm -f initcheck
```
Expected: 5 `gym_*` tables are listed, then `idempotent`.

- [ ] **Step 4: Regression check on existing features.** In the browser, confirm Today, This Week, Backlog, Todos, Notes and History still load and the progress header still updates. The `request()` error change must not break anything.

- [ ] **Step 5: Report to the user.** Include:
- The deploy note: pushing to `master` triggers the workflow, which now applies `database/migrations/*.sql`, creating the gym tables in prod.
- The data migration command, to run once on the VM after the deploy:
  `cd /opt/progress-app && scripts/migrate-gym-data.sh <your-gym-login>`
  Before running it, check that `docker exec gym-tracker-db-1 psql -U gym -d gym -c '\d day_exercises'` shows `extra_segments jsonb`.
- Once the data is verified, the old gym app can be stopped (`docker compose -f deploy/docker-compose.cohost.yml down` in the gym repo). That is the user's call; don't do it automatically.
