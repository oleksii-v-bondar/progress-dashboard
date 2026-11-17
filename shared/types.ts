export type TaskStatus = 'backlog' | 'this_week' | 'today' | 'archived';

export interface Area {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface Skill {
  id: string;
  area_id: string;
  name: string;
  created_at: string;
}

export interface Task {
  id: string;
  skill_id: string;
  name: string;
  description: string | null;
  status: TaskStatus;
  created_at: string;
}

export interface TaskWithDetails extends Task {
  skill_name: string;
  area_name: string;
  area_color: string;
  completed_today: boolean;
}

export interface Completion {
  id: string;
  task_id: string;
  completed_at: string;
}

export interface ProgressStats {
  completed: number;
  total: number;
  learning: number;
  todos: number;
}

export interface AreaProgress {
  area_id: string;
  area_name: string;
  color: string;
  completed: number;
  total: number;
}

export interface Note {
  id: string;
  content: string;
  answered: boolean;
  created_at: string;
}

export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  completed_at: string | null;
  position: number;
  created_at: string;
}

export interface AllTimeStats {
  total_completions: number;
  learning_completions: number;
  todo_completions: number;
  tasks_created: number;
  todos_created: number;
  current_streak: number;
  longest_streak: number;
}

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
