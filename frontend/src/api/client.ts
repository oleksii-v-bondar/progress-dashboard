import type { Area, Skill, Task, TaskWithDetails, ProgressStats, AreaProgress, Note, Todo, AllTimeStats, GymPlan, GymPlanTree, GymPlanImport, GymDayDetail, GymExerciseInput, GymSessionRow, GymSessionDetail, GymNewSet, GymSetInput, GymSuggestion, GymTrend } from '@shared/types';

const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options,
  });
  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.reload();
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; details?: string[] } | null;
    throw new Error(body?.error ? [body.error, ...(body.details ?? [])].join('\n') : `API error: ${res.status}`);
  }
  return res.json();
}

export async function login(password: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) return false;
  const { token } = await res.json();
  localStorage.setItem('token', token);
  return true;
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem('token');
}

export const api = {
  // Areas
  getAreas: () => request<(Area & { skills: Skill[] })[]>('/areas'),
  createArea: (data: { name: string; color: string }) =>
    request<Area>('/areas', { method: 'POST', body: JSON.stringify(data) }),
  updateArea: (id: string, data: { name?: string; color?: string }) =>
    request<Area>(`/areas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteArea: (id: string) =>
    request<void>(`/areas/${id}`, { method: 'DELETE' }),

  // Skills
  createSkill: (areaId: string, data: { name: string }) =>
    request<Skill>(`/areas/${areaId}/skills`, { method: 'POST', body: JSON.stringify(data) }),
  updateSkill: (id: string, data: { name: string }) =>
    request<Skill>(`/skills/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSkill: (id: string) =>
    request<void>(`/skills/${id}`, { method: 'DELETE' }),

  // Tasks
  getTasks: (params?: { status?: string; area_id?: string; skill_id?: string }) => {
    const query = params ? '?' + new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)) as Record<string, string>
    ).toString() : '';
    return request<TaskWithDetails[]>(`/tasks${query}`);
  },
  createTask: (data: { skill_id: string; name: string; description?: string; status?: string }) =>
    request<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id: string, data: { name?: string; description?: string; status?: string }) =>
    request<Task>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  moveTask: (id: string, status: string) =>
    request<Task>(`/tasks/${id}/move`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  reorderTasks: (taskIds: string[]) =>
    request<void>('/tasks/reorder', { method: 'PATCH', body: JSON.stringify({ taskIds }) }),
  deleteTask: (id: string) =>
    request<void>(`/tasks/${id}`, { method: 'DELETE' }),

  // Completions
  completeTask: (id: string) =>
    request<{ id: string; task_id: string; completed_at: string }>(`/tasks/${id}/complete`, { method: 'POST' }),
  uncompleteTask: (id: string) =>
    request<void>(`/tasks/${id}/complete`, { method: 'DELETE' }),

  // Todos
  getTodos: () => request<Todo[]>('/todos'),
  getCompletedTodos: () => request<Todo[]>('/todos?completed=true'),
  createTodo: (title: string) =>
    request<Todo>('/todos', { method: 'POST', body: JSON.stringify({ title }) }),
  updateTodo: (id: string, title: string) =>
    request<Todo>(`/todos/${id}`, { method: 'PUT', body: JSON.stringify({ title }) }),
  deleteTodo: (id: string) =>
    request<void>(`/todos/${id}`, { method: 'DELETE' }),
  completeTodo: (id: string) =>
    request<Todo>(`/todos/${id}/complete`, { method: 'POST' }),
  reorderTodos: (todoIds: string[]) =>
    request<void>('/todos/reorder', { method: 'PATCH', body: JSON.stringify({ todoIds }) }),

  // Progress
  getProgressToday: () => request<ProgressStats>('/progress/today'),
  getProgressWeek: () => request<ProgressStats>('/progress/week'),
  getProgressAreas: () => request<AreaProgress[]>('/progress/areas'),
  getProgressHistory: () => request<{
    weeks: Array<{ week_start: string; completed: number; learning: number; todos: number }>;
    daily: Array<{ day: string; completed: number; learning: number; todos: number }>;
  }>('/progress/history'),
  getAllTimeStats: () => request<AllTimeStats>('/progress/alltime'),

  // Notes
  getNotes: () => request<Note[]>('/notes'),
  createNote: (content: string) =>
    request<Note>('/notes', { method: 'POST', body: JSON.stringify({ content }) }),
  updateNote: (id: string, data: { content?: string; answered?: boolean }) =>
    request<Note>(`/notes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteNote: (id: string) =>
    request<void>(`/notes/${id}`, { method: 'DELETE' }),

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
};
