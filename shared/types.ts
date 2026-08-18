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
