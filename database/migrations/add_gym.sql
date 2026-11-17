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
