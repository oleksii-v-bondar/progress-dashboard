import type { Area, Skill, Task, TaskWithDetails, ProgressStats, AreaProgress, Note, Todo, AllTimeStats } from '@shared/types';

const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
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
};
