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
