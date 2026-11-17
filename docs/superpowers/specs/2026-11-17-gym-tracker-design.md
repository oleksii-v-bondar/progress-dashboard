# Gym Tracker in Progress Dashboard — Design

Port every feature of `../gym-and-food` (a gym workout tracker — it has no food features) into
progress-dashboard as a **Gym** sidebar section, single-user, in the dashboard's visual style.

## Decisions

- **Native port** into the dashboard stack: Express + Knex routes, React pages using existing
  hooks / `api` client / CSS-variable inline styles. No React Router, React Query or Zod.
- **Navigation:** a "Gym" section in the existing sidebar (below the main nav, above Areas) with
  *Plans*, *New plan*, *History*. The Today/Week progress header stays visible; gym data does
  not affect it.
- **Single user:** no `users` table, no `user_id` columns, no ownership checks. All former
  admin features are always available.
- **Templates simplified:** no template flag / read-only / auto-fork. Replaced by a plain
  **Duplicate plan** action. JSON import/export kept.
- **Data migration:** one-off script copies the user's data from the gym-and-food DB.
- **Charts:** add `recharts` to the frontend.

## Data model (`database/migrations/add_gym.sql`, also appended to `init.sql`)

```sql
CREATE TYPE gym_effort AS ENUM ('easy', 'ok', 'hard', 'failed');

CREATE TABLE gym_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE gym_plan_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES gym_plans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  is_superset BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE gym_day_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_day_id UUID NOT NULL REFERENCES gym_plan_days(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  target_sets INT NOT NULL,
  target_reps INT NOT NULL,
  rest_seconds INT,
  starting_weight NUMERIC,
  extra_segments JSONB NOT NULL DEFAULT '[]'   -- [{ "reps": int>0 }]
);
CREATE TABLE gym_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_day_id UUID NOT NULL REFERENCES gym_plan_days(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE TABLE gym_set_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES gym_sessions(id) ON DELETE CASCADE,
  day_exercise_id UUID NOT NULL REFERENCES gym_day_exercises(id) ON DELETE CASCADE,
  set_number INT NOT NULL,
  weight_used NUMERIC NOT NULL,          -- negative = assisted, 0 = bodyweight
  reps_done INT NOT NULL,
  effort gym_effort NOT NULL,
  extra_segments JSONB NOT NULL DEFAULT '[]',  -- [{ "weight": number, "reps": int>=0 }]
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_gym_set_logs_ex_time ON gym_set_logs(day_exercise_id, created_at);
CREATE INDEX idx_gym_sessions_day_time ON gym_sessions(plan_day_id, started_at);
```

The deploy workflow applies every `database/migrations/*.sql` after `docker compose up`, so all
migration files must be idempotent. Migration file uses `IF NOT EXISTS` / a `DO $$` guard for the enum so it is re-runnable.
NUMERIC columns are returned as strings by `pg`; routes convert them to numbers.

## API (`backend/src/routes/gym.ts`, mounted at `/api/gym` behind `authMiddleware`)

Validation is hand-written (as in existing routes); invalid input → `400 {error}`; missing or
soft-deleted entities (or non-UUID ids) → `404 {error:'not found'}`. DELETE endpoints return
`200 {success:true}` (dashboard convention — the frontend `request()` always parses JSON).
Async handlers are wrapped so DB errors become `500` instead of hanging (Express 4).

| Method | Path | Body / result |
|---|---|---|
| GET | `/plans` | non-deleted plans `{id,name,is_active}[]`, ordered by created_at |
| POST | `/plans` | `{name}` → `201 {id}` |
| GET | `/plans/:id` | `{id,name,is_active,days:[{id,name,order_index,is_superset,exercises:[{id,exercise_name,order_index,target_sets,target_reps,rest_seconds,starting_weight,extra_segments}]}]}` |
| PUT | `/plans/:id` | optional `{name,is_active}` → `{id}`; setting `is_active=true` clears it on other plans |
| DELETE | `/plans/:id` | soft delete |
| POST | `/plans/:id/duplicate` | deep copy as `"<name> (copy)"`, inactive → `201 {id}` |
| POST | `/plans/import` | import JSON (format below) → `201 {id}` / `400 {error:'invalid plan',details}` |
| GET | `/plans/:id/export` | plan in import format (no ids/order fields) |
| POST | `/plans/:id/days` | `{name}` → `201 {id}`, appended order |
| GET | `/days/:id` | `{id,name,is_superset,plan_id,exercises:[...]}` |
| PUT | `/days/:id` | optional `{name,order_index,is_superset}` → `{id}` |
| DELETE | `/days/:id` | hard delete (cascades) |
| POST | `/days/:id/exercises` | `{exercise_name,target_sets>0,target_reps>0,rest_seconds?,starting_weight?,extra_segments?}` → `201 {id}` |
| PUT | `/exercises/:id` | partial exercise fields → `{id}` |
| DELETE | `/exercises/:id` | hard delete (cascades) |
| POST | `/sessions` | `{plan_day_id}`; reuse latest unfinished session for that day (200) else create (201) → `{id,started_at}` |
| GET | `/sessions` | finished, newest first: `{id,finished_at,plan_day_id,day_name,set_count}[]` |
| GET | `/sessions/active` | unfinished: `{id,plan_day_id,started_at,day_name,set_count}[]` |
| GET | `/sessions/:id` | `{id,plan_day_id,started_at,finished_at,day_name,sets:[{id,day_exercise_id,exercise_name,set_number,weight_used,reps_done,effort,extra_segments,created_at}]}` |
| DELETE | `/sessions/:id` | discard/delete (cascades logs) |
| POST | `/sessions/:id/sets` | `{day_exercise_id,set_number>0,weight_used:number,reps_done>=0,effort,extra_segments?:[{weight,reps>=0}]}` → `201 {id}` |
| PATCH | `/sessions/:id/sets/:setId` | `{weight_used,reps_done,effort,extra_segments}` → `{id}` |
| POST | `/sessions/:id/finish` | sets `finished_at=now()` → `{id,finished_at}` |
| GET | `/exercises/:id/suggestion` | `{weight:number|null,reason}` |
| GET | `/exercises/:id/trend` | `{exercise_name,series:[{date,topWeight,bestE1rm}],label,slope}` |

**Import format:** `{name:string≥1, days:[{name:string≥1, is_superset?:bool, exercises:[{exercise_name:string≥1, target_sets:int>0, target_reps:int>0, rest_seconds?:int≥0|null, starting_weight?:number|null, extra_segments?:[{reps:int>0}]}]}]}`; empty arrays allowed. Compatible with files exported from gym-and-food.

## Algorithms (`backend/src/gym/logic.ts`, pure, unit-tested)

- **suggest(exercise, lastFinishedSessionSets):** input sets = this exercise's sets from the
  most recently finished session that logged it (ordered by `finished_at DESC, id DESC`). No history → `starting_weight` with reason, or
  `null` asking for a weight. Otherwise `last = max(weight_used)`; if any set `failed` or
  `reps_done < target_reps` → `last − 2.5`; else if all sets `easy` → `last + 2.5`; else hold
  `last`. No zero floor (assisted negatives allowed).
- **trend(sets of finished sessions):** per non-empty session `topWeight = max(weight)`,
  `bestE1rm = max(weight·(1+reps/30))`; keep the last 5 sessions by date. `<2` →
  `insufficient`, slope 0. Else least-squares slope of e1RM vs index `0..n−1`:
  `>0.1` progressing, `<−0.1` regressing, otherwise steady.
- **formatSet (frontend `pages/gym/setFormat.ts`):** negative → `Assisted |w| kg × r (effort)`;
  zero → `Bodyweight × r reps (effort)`; positive → `w kg × r (effort)`. Segments: `×r` at zero
  weight else `w×r`.

## Frontend

- `api/client.ts` gains `gym*` functions; types in `shared/types.ts` (`Gym*`).
- Sidebar: "GYM" heading (same style as "AREAS") with nav items `gym-plans`, `gym-new`,
  `gym-history`. App `renderView` handles `gym-*` view ids; parameterised views use
  `gym-plan-<id>`, `gym-edit-<id>`, `gym-session-<dayId>`, `gym-history-<id>`,
  `gym-history-edit-<id>`, `gym-progress-<exerciseId>`. Pages receive `onNavigate(view)`.
- Pages in `frontend/src/pages/gym/`:
  - **GymPlansView** — plan list (active marker), `InProgressBanner` (active sessions with set
    count; Resume, Discard with confirm), empty state linking to New plan / Import.
  - **GymNewPlanView** — name → create → editor; JSON file import.
  - **GymPlanView** — days and exercises (sets×reps, rest, superset badge, drops/ups count),
    Start/Resume per day, progress link per exercise, Edit, Duplicate, Export (downloads
    `<name>.json`), Set active, Delete (confirm).
  - **GymPlanEditorView** — rename plan; add/rename/delete days; toggle superset; add/edit/
    delete exercises (name, sets, reps, rest, starting weight, extra segment reps list).
  - **GymSessionView** — start-or-resume; schedule: superset days round-major (one set of each
    exercise per round, rounds = max target sets, every exercise appears in every round — same as
    the original app), otherwise
    exercise-major; resume step from logged-set count; carry last logged weight forward for
    the current exercise; Finish early / Finish & save; "Set logged" flash ~1.2 s.
  - **ExerciseLogger** — set-completion dots (clamped), reps default target, weight default
    suggestion (with reason), negative/zero allowed, editable extra segments (add/remove,
    weight/reps), effort buttons easy/ok/hard log immediately; failed prompts for completed
    reps then confirm/cancel.
  - **GymHistoryView** — finished sessions newest first, date, set count, open, delete (confirm).
  - **GymSessionDetailView** — sets grouped by exercise via `formatSet`; Edit link.
  - **GymSessionEditView** — edit weight/reps/effort/segments per set, require weight & reps,
    PATCH each; partial-failure warning.
  - **GymProgressView** — Recharts line chart (top weight, est. 1RM), `TrendBadge`
    (▲ Progressing / ▬ Steady / ▼ Regressing / • Not enough data yet), recent history list.
- Styling: existing CSS variables (`--bg-secondary` cards, `--accent` primary buttons,
  `--danger` destructive, `--success` flash), mobile-friendly with the existing layout.

## Data migration (`scripts/migrate-gym-data.sh <login>`)

Runs on the VM. Uses `docker exec` + `psql \copy`-style `COPY ... TO STDOUT` from the
gym-tracker db container into temp tables in the progress db container, then
`INSERT ... SELECT ... ON CONFLICT (id) DO NOTHING` (idempotent, UUIDs preserved).
Copies, for the given login: plans owned by the user (including templates and soft-deleted
ones so history stays resolvable), their days and exercises, the user's sessions, and their
set logs. Container names / DB credentials configurable via env vars with defaults
(`GYM_DB_CONTAINER=gym-tracker-db-1`, `PROGRESS_DB_CONTAINER` auto-detected from
`docker-compose.prod.yml`). Prints row counts.

## Testing

- Add `vitest` to backend; unit tests for `suggest` and `trend`; frontend `formatSet` test
  is skipped (no frontend test infra; trivial).
- Manual end-to-end via `docker compose up`: create/import plan, log sessions incl.
  superset, drops, failed, assisted; resume; history edit/delete; progress chart; export.
- `tsc` build for backend and frontend must pass.
