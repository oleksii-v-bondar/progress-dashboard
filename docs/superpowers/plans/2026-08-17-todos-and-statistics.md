# Todos & Enhanced Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a flat todo list (no skill/area) with cyan styling, include todos in all statistics, and add all-time stats + split history bars to the History view.

**Architecture:** New `todos` DB table independent of `tasks`. Backend adds `/api/todos` CRUD routes and updates all progress endpoints to return `learning`/`todos` breakdown. Frontend adds a `TodosView` page, `useTodos` hook, and updates `ProgressOverview` and `HistoryView` to show split bars.

**Tech Stack:** PostgreSQL 16, Knex, Express/TypeScript (backend); React 18 + TypeScript + Vite, `@hello-pangea/dnd`, `framer-motion` (frontend).

## Global Constraints

- Todo color constant: `#06b6d4` (cyan) — used in all bar segments and checkboxes.
- Learning/tasks color: `#6366f1` (indigo/accent, `var(--accent)`).
- Completed todos auto-hide (no undo UI); `completed_at DATE` records when.
- No changes to existing `tasks`, `completions`, `areas`, or `skills` tables.
- All new files follow existing TypeScript patterns (no `any`, proper return types).
- Backend route ordering: literal routes (`/reorder`, `/alltime`) always before parameterized (`/:id`).
- `shared/types.ts` is the single source of truth for shared interfaces.

---

## File Map

**New files:**
- `database/migrations/add_todos.sql` — SQL to run on live DB
- `backend/src/routes/todos.ts` — CRUD for todos
- `frontend/src/hooks/useTodos.ts` — React hook mirroring `useTasks`
- `frontend/src/pages/TodosView.tsx` — flat todo list page

**Modified files:**
- `database/init.sql` — add `todos` table definition
- `shared/types.ts` — add `Todo`, `AllTimeStats`; update `ProgressStats`
- `backend/src/routes/progress.ts` — add `learning`/`todos` breakdown + `/alltime` endpoint
- `backend/src/index.ts` — register `/api/todos` router
- `frontend/src/api/client.ts` — add todos API methods + updated progress types
- `frontend/src/hooks/useProgress.ts` — pass through new `learning`/`todos` fields
- `frontend/src/components/ProgressOverview.tsx` — split segmented bars
- `frontend/src/components/Sidebar.tsx` — add "Todos" nav item
- `frontend/src/pages/HistoryView.tsx` — all-time stats section + split history bars
- `frontend/src/App.tsx` — add todos view to router

---

## Task 1: Database — add todos table

**Files:**
- Create: `database/migrations/add_todos.sql`
- Modify: `database/init.sql`

**Interfaces:**
- Produces: `todos` table with columns `id UUID PK`, `title VARCHAR(255) NOT NULL`, `completed BOOLEAN DEFAULT false`, `completed_at DATE`, `position INTEGER DEFAULT 0`, `created_at TIMESTAMPTZ DEFAULT NOW()`

- [ ] **Step 1: Write the migration file**

Create `database/migrations/add_todos.sql`:
```sql
CREATE TABLE IF NOT EXISTS todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at DATE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

- [ ] **Step 2: Add the same table to init.sql**

In `database/init.sql`, append after the `notes` table:
```sql
CREATE TABLE todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at DATE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

- [ ] **Step 3: Run migration on live DB**

```bash
docker exec -i progress-app-db-1 psql -U postgres -d progress < database/migrations/add_todos.sql
```
Expected output: `CREATE TABLE`

- [ ] **Step 4: Verify table exists**

```bash
docker exec -i progress-app-db-1 psql -U postgres -d progress -c "\d todos"
```
Expected: table description showing all 6 columns.

- [ ] **Step 5: Commit**

```bash
git add database/init.sql database/migrations/add_todos.sql
git commit -m "feat: add todos table to schema"
```

---

## Task 2: Shared types — add Todo, AllTimeStats; update ProgressStats

**Files:**
- Modify: `shared/types.ts`

**Interfaces:**
- Consumes: nothing new
- Produces:
  - `Todo { id, title, completed, completed_at, position, created_at }`
  - `ProgressStats` updated with `learning: number; todos: number`
  - `AllTimeStats { total_completions, learning_completions, todo_completions, tasks_created, todos_created, current_streak, longest_streak }`

- [ ] **Step 1: Update shared/types.ts**

Replace the file content with:
```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add shared/types.ts
git commit -m "feat: add Todo and AllTimeStats types; add learning/todos to ProgressStats"
```

---

## Task 3: Backend — todos CRUD routes

**Files:**
- Create: `backend/src/routes/todos.ts`
- Modify: `backend/src/index.ts`

**Interfaces:**
- Consumes: `todos` table (Task 1)
- Produces:
  - `GET /api/todos` → `Todo[]` (incomplete only, ordered by `position`)
  - `POST /api/todos` body `{ title: string }` → `Todo`
  - `PUT /api/todos/:id` body `{ title: string }` → `Todo`
  - `DELETE /api/todos/:id` → `{ success: true }`
  - `POST /api/todos/:id/complete` → `Todo` (sets `completed=true`, `completed_at=today`)
  - `PATCH /api/todos/reorder` body `{ todoIds: string[] }` → `{ success: true }`

- [ ] **Step 1: Create backend/src/routes/todos.ts**

```ts
import { Router } from 'express';
import db from '../db/knex';

const router = Router();

router.get('/', async (_req, res) => {
  const todos = await db('todos')
    .where({ completed: false })
    .orderBy('position', 'asc');
  res.json(todos);
});

router.post('/', async (req, res) => {
  const { title } = req.body as { title: string };
  const [todo] = await db('todos').insert({ title }).returning('*');
  res.status(201).json(todo);
});

// IMPORTANT: /reorder must come before /:id to avoid Express matching "reorder" as an id
router.patch('/reorder', async (req, res) => {
  const { todoIds } = req.body as { todoIds: string[] };
  await Promise.all(
    todoIds.map((id, index) => db('todos').where({ id }).update({ position: index }))
  );
  res.json({ success: true });
});

router.post('/:id/complete', async (req, res) => {
  const { id } = req.params;
  const today = new Date().toISOString().split('T')[0];
  const [todo] = await db('todos')
    .where({ id })
    .update({ completed: true, completed_at: today })
    .returning('*');
  if (!todo) return res.status(404).json({ error: 'Todo not found' });
  res.json(todo);
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { title } = req.body as { title: string };
  const [todo] = await db('todos').where({ id }).update({ title }).returning('*');
  if (!todo) return res.status(404).json({ error: 'Todo not found' });
  res.json(todo);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  await db('todos').where({ id }).del();
  res.json({ success: true });
});

export default router;
```

- [ ] **Step 2: Register router in backend/src/index.ts**

Add after the notes router import and registration:
```ts
import todosRouter from './routes/todos';
// ...
app.use('/api/todos', todosRouter);
```

Full updated `backend/src/index.ts`:
```ts
import express from 'express';
import cors from 'cors';
import areasRouter from './routes/areas';
import skillsRouter from './routes/skills';
import tasksRouter from './routes/tasks';
import completionsRouter from './routes/completions';
import progressRouter from './routes/progress';
import notesRouter from './routes/notes';
import todosRouter from './routes/todos';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/areas', areasRouter);
app.use('/api', skillsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/tasks', completionsRouter);
app.use('/api/progress', progressRouter);
app.use('/api/notes', notesRouter);
app.use('/api/todos', todosRouter);

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

export default app;
```

- [ ] **Step 3: Test the routes manually**

```bash
# Create a todo
curl -s -X POST http://localhost:4000/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title":"Test todo"}' | jq .

# List todos
curl -s http://localhost:4000/api/todos | jq .

# Complete it (use the id from above)
curl -s -X POST http://localhost:4000/api/todos/<id>/complete | jq .

# List again - should be empty
curl -s http://localhost:4000/api/todos | jq .
```
Expected: create returns a todo object, list returns `[]` after completion.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/todos.ts backend/src/index.ts
git commit -m "feat: add todos CRUD backend routes"
```

---

## Task 4: Backend — update progress endpoints with learning/todos breakdown + /alltime

**Files:**
- Modify: `backend/src/routes/progress.ts`

**Interfaces:**
- Consumes: `todos` table (Task 1), `completions`/`tasks` tables
- Produces:
  - `GET /progress/today` → `{ completed, total, learning, todos }`
  - `GET /progress/week` → `{ completed, total, learning, todos }`
  - `GET /progress/history` → `{ weeks: [{week_start, completed, learning, todos}], daily: [{day, completed, learning, todos}] }`
  - `GET /progress/alltime` → `AllTimeStats`

- [ ] **Step 1: Replace backend/src/routes/progress.ts**

```ts
import { Router } from 'express';
import db from '../db/knex';

const router = Router();

router.get('/today', async (_req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const [{ count: learningCompleted }] = await db('completions')
    .where('completed_at', today)
    .count('id as count');

  const [{ count: todosCompleted }] = await db('todos')
    .where({ completed: true })
    .where('completed_at', today)
    .count('id as count');

  const [{ count: todayTasks }] = await db('tasks')
    .where('status', 'today')
    .count('id as count');

  const [{ count: archivedToday }] = await db('completions')
    .join('tasks', 'completions.task_id', 'tasks.id')
    .where('completions.completed_at', today)
    .where('tasks.status', 'archived')
    .count('completions.id as count');

  const [{ count: incompleteTodos }] = await db('todos')
    .where({ completed: false })
    .count('id as count');

  const learning = Number(learningCompleted);
  const todos = Number(todosCompleted);
  const completed = learning + todos;
  const total = Number(todayTasks) + Number(archivedToday) + Number(incompleteTodos) + todos;

  res.json({ completed, total, learning, todos });
});

router.get('/week', async (_req, res) => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);
  const mondayStr = monday.toISOString().split('T')[0];
  const todayStr = now.toISOString().split('T')[0];

  const [{ count: learningCompleted }] = await db('completions')
    .where('completed_at', '>=', mondayStr)
    .where('completed_at', '<=', todayStr)
    .count('id as count');

  const [{ count: todosCompleted }] = await db('todos')
    .where({ completed: true })
    .where('completed_at', '>=', mondayStr)
    .where('completed_at', '<=', todayStr)
    .count('id as count');

  const [{ count: plannedCount }] = await db('tasks')
    .whereIn('status', ['today', 'this_week'])
    .count('id as count');

  const [{ count: extraCompleted }] = await db('completions')
    .join('tasks', 'completions.task_id', 'tasks.id')
    .where('completions.completed_at', '>=', mondayStr)
    .where('completions.completed_at', '<=', todayStr)
    .whereNotIn('tasks.status', ['today', 'this_week'])
    .count('completions.id as count');

  const [{ count: incompleteTodos }] = await db('todos')
    .where({ completed: false })
    .count('id as count');

  const learning = Number(learningCompleted);
  const todos = Number(todosCompleted);
  const completed = learning + todos;
  const total = Number(plannedCount) + Number(extraCompleted) + Number(incompleteTodos) + todos;

  res.json({ completed, total, learning, todos });
});

router.get('/areas', async (_req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const areas = await db('areas').orderBy('created_at', 'asc');

  const areaProgress = await Promise.all(
    areas.map(async (area) => {
      const [{ count: todayTasks }] = await db('tasks')
        .join('skills', 'tasks.skill_id', 'skills.id')
        .where('skills.area_id', area.id)
        .where('tasks.status', 'today')
        .count('tasks.id as count');

      const [{ count: archivedToday }] = await db('completions')
        .join('tasks', 'completions.task_id', 'tasks.id')
        .join('skills', 'tasks.skill_id', 'skills.id')
        .where('skills.area_id', area.id)
        .where('tasks.status', 'archived')
        .where('completions.completed_at', today)
        .count('completions.id as count');

      const [{ count: completed }] = await db('completions')
        .join('tasks', 'completions.task_id', 'tasks.id')
        .join('skills', 'tasks.skill_id', 'skills.id')
        .where('skills.area_id', area.id)
        .where('completions.completed_at', today)
        .count('completions.id as count');

      return {
        area_id: area.id,
        area_name: area.name,
        color: area.color,
        completed: Number(completed),
        total: Number(todayTasks) + Number(archivedToday),
      };
    })
  );

  res.json(areaProgress);
});

router.get('/alltime', async (_req, res) => {
  const [{ count: learningCompletions }] = await db('completions').count('id as count');
  const [{ count: todoCompletions }] = await db('todos').where({ completed: true }).count('id as count');
  const [{ count: tasksCreated }] = await db('tasks').count('id as count');
  const [{ count: todosCreated }] = await db('todos').count('id as count');

  // Streak: consecutive days ending today with at least 1 completion (tasks or todos)
  // Get all distinct days with any completion
  const taskDays = await db('completions')
    .distinct('completed_at as day')
    .orderBy('completed_at', 'desc');
  const todoDays = await db('todos')
    .where({ completed: true })
    .whereNotNull('completed_at')
    .distinct('completed_at as day')
    .orderBy('completed_at', 'desc');

  const allDays = new Set<string>([
    ...taskDays.map((r: { day: string }) => r.day.toString().split('T')[0]),
    ...todoDays.map((r: { day: string }) => r.day.toString().split('T')[0]),
  ]);

  const sortedDays = Array.from(allDays).sort().reverse(); // most recent first

  const today = new Date().toISOString().split('T')[0];

  // Current streak
  let currentStreak = 0;
  const checkDate = new Date(today);
  while (allDays.has(checkDate.toISOString().split('T')[0])) {
    currentStreak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  // Longest streak
  let longestStreak = 0;
  let streak = 0;
  let prevDate: Date | null = null;
  for (const dayStr of sortedDays.slice().reverse()) {
    const d = new Date(dayStr);
    if (prevDate === null) {
      streak = 1;
    } else {
      const diff = (d.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
      if (Math.round(diff) === 1) {
        streak++;
      } else {
        streak = 1;
      }
    }
    if (streak > longestStreak) longestStreak = streak;
    prevDate = d;
  }

  res.json({
    total_completions: Number(learningCompletions) + Number(todoCompletions),
    learning_completions: Number(learningCompletions),
    todo_completions: Number(todoCompletions),
    tasks_created: Number(tasksCreated),
    todos_created: Number(todosCreated),
    current_streak: currentStreak,
    longest_streak: longestStreak,
  });
});

router.get('/history', async (_req, res) => {
  // Task completions grouped by week
  const taskWeeks = await db.raw(`
    SELECT
      date_trunc('week', completed_at)::date as week_start,
      count(*) as completed
    FROM completions
    WHERE completed_at >= CURRENT_DATE - INTERVAL '12 weeks'
    GROUP BY week_start
    ORDER BY week_start DESC
  `);

  // Todo completions grouped by week
  const todoWeeks = await db.raw(`
    SELECT
      date_trunc('week', completed_at)::date as week_start,
      count(*) as completed
    FROM todos
    WHERE completed = true
      AND completed_at >= CURRENT_DATE - INTERVAL '12 weeks'
    GROUP BY week_start
    ORDER BY week_start DESC
  `);

  // Build merged weeks map
  const weeksMap = new Map<string, { learning: number; todos: number }>();
  for (const r of taskWeeks.rows) {
    const key = r.week_start.toString().split('T')[0];
    weeksMap.set(key, { learning: Number(r.completed), todos: 0 });
  }
  for (const r of todoWeeks.rows) {
    const key = r.week_start.toString().split('T')[0];
    const existing = weeksMap.get(key) || { learning: 0, todos: 0 };
    weeksMap.set(key, { ...existing, todos: Number(r.completed) });
  }

  const weeks = Array.from(weeksMap.entries())
    .map(([week_start, counts]) => ({
      week_start,
      completed: counts.learning + counts.todos,
      learning: counts.learning,
      todos: counts.todos,
    }))
    .sort((a, b) => b.week_start.localeCompare(a.week_start));

  // Daily breakdown for current week
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);
  const mondayStr = monday.toISOString().split('T')[0];

  const taskDaily = await db.raw(`
    SELECT completed_at::date as day, count(*) as completed
    FROM completions
    WHERE completed_at >= ?
    GROUP BY day ORDER BY day ASC
  `, [mondayStr]);

  const todoDaily = await db.raw(`
    SELECT completed_at::date as day, count(*) as completed
    FROM todos
    WHERE completed = true AND completed_at >= ?
    GROUP BY day ORDER BY day ASC
  `, [mondayStr]);

  const dailyMap = new Map<string, { learning: number; todos: number }>();
  for (const r of taskDaily.rows) {
    const key = r.day.toString().split('T')[0];
    dailyMap.set(key, { learning: Number(r.completed), todos: 0 });
  }
  for (const r of todoDaily.rows) {
    const key = r.day.toString().split('T')[0];
    const existing = dailyMap.get(key) || { learning: 0, todos: 0 };
    dailyMap.set(key, { ...existing, todos: Number(r.completed) });
  }

  const daily = Array.from(dailyMap.entries())
    .map(([day, counts]) => ({
      day,
      completed: counts.learning + counts.todos,
      learning: counts.learning,
      todos: counts.todos,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));

  res.json({ weeks, daily });
});

export default router;
```

- [ ] **Step 2: Test the updated endpoints**

```bash
curl -s http://localhost:4000/api/progress/today | jq .
# Expected: { completed, total, learning, todos }

curl -s http://localhost:4000/api/progress/week | jq .
# Expected: { completed, total, learning, todos }

curl -s http://localhost:4000/api/progress/alltime | jq .
# Expected: { total_completions, learning_completions, todo_completions, tasks_created, todos_created, current_streak, longest_streak }

curl -s http://localhost:4000/api/progress/history | jq .
# Expected: { weeks: [{week_start, completed, learning, todos}], daily: [{day, completed, learning, todos}] }
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/progress.ts
git commit -m "feat: add learning/todos breakdown and alltime stats to progress endpoints"
```

---

## Task 5: Frontend API client + useProgress hook updates

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/hooks/useProgress.ts`

**Interfaces:**
- Consumes: backend routes from Tasks 3 & 4; `Todo`, `AllTimeStats`, updated `ProgressStats` from Task 2
- Produces:
  - `api.getTodos()` → `Todo[]`
  - `api.createTodo(title)` → `Todo`
  - `api.updateTodo(id, title)` → `Todo`
  - `api.deleteTodo(id)` → `void`
  - `api.completeTodo(id)` → `Todo`
  - `api.reorderTodos(todoIds)` → `void`
  - `api.getAllTimeStats()` → `AllTimeStats`
  - `useProgress()` exposes `today.learning`, `today.todos`, `week.learning`, `week.todos`

- [ ] **Step 1: Update frontend/src/api/client.ts**

Replace the full file:
```ts
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
```

- [ ] **Step 2: Update frontend/src/hooks/useProgress.ts**

`ProgressStats` now has `learning` and `todos` fields; ensure default state matches:
```ts
import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import type { ProgressStats, AreaProgress } from '@shared/types';

interface ProgressData {
  today: ProgressStats;
  week: ProgressStats;
  areas: AreaProgress[];
}

export function useProgress() {
  const [data, setData] = useState<ProgressData>({
    today: { completed: 0, total: 0, learning: 0, todos: 0 },
    week: { completed: 0, total: 0, learning: 0, todos: 0 },
    areas: [],
  });

  const refresh = useCallback(async () => {
    const [today, week, areas] = await Promise.all([
      api.getProgressToday(),
      api.getProgressWeek(),
      api.getProgressAreas(),
    ]);
    setData({ today, week, areas });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { ...data, refresh };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/e161739/ClaudeWorkspace/progress-app/frontend && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors related to the new types.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/hooks/useProgress.ts
git commit -m "feat: add todos API methods and alltime stats to client; update useProgress types"
```

---

## Task 6: Frontend — useTodos hook

**Files:**
- Create: `frontend/src/hooks/useTodos.ts`

**Interfaces:**
- Consumes: `api.getTodos`, `api.createTodo`, `api.updateTodo`, `api.deleteTodo`, `api.completeTodo`, `api.reorderTodos` (Task 5)
- Produces: `useTodos()` returning `{ todos, createTodo, updateTodo, deleteTodo, completeTodo, reorder, loading }`

- [ ] **Step 1: Create frontend/src/hooks/useTodos.ts**

```ts
import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import type { Todo } from '@shared/types';

export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTodos = useCallback(async () => {
    setLoading(true);
    const data = await api.getTodos();
    setTodos(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTodos(); }, [fetchTodos]);

  const createTodo = async (title: string) => {
    await api.createTodo(title);
    await fetchTodos();
  };

  const updateTodo = async (id: string, title: string) => {
    await api.updateTodo(id, title);
    await fetchTodos();
  };

  const deleteTodo = async (id: string) => {
    await api.deleteTodo(id);
    await fetchTodos();
  };

  const completeTodo = async (id: string) => {
    // Optimistic: remove from list immediately
    setTodos(prev => prev.filter(t => t.id !== id));
    await api.completeTodo(id);
  };

  const reorder = async (sourceIndex: number, destinationIndex: number) => {
    const reordered = [...todos];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(destinationIndex, 0, moved);
    setTodos(reordered);
    await api.reorderTodos(reordered.map(t => t.id));
  };

  return { todos, createTodo, updateTodo, deleteTodo, completeTodo, reorder, loading };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useTodos.ts
git commit -m "feat: add useTodos hook with optimistic complete and reorder"
```

---

## Task 7: Frontend — TodosView page + sidebar + App routing

**Files:**
- Create: `frontend/src/pages/TodosView.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useTodos` (Task 6); `@hello-pangea/dnd` (already installed)
- Produces: `<TodosView onProgressChange />` page rendered at view `'todos'`

- [ ] **Step 1: Create frontend/src/pages/TodosView.tsx**

```tsx
import { useState, useRef } from 'react';
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';
import { useTodos } from '../hooks/useTodos';

const TODO_COLOR = '#06b6d4';

interface TodosViewProps {
  onProgressChange: () => void;
}

export function TodosView({ onProgressChange }: TodosViewProps) {
  const { todos, createTodo, updateTodo, deleteTodo, completeTodo, reorder, loading } = useTodos();
  const [newTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await createTodo(newTitle.trim());
    setNewTitle('');
    onProgressChange();
  };

  const handleComplete = async (id: string) => {
    await completeTodo(id);
    onProgressChange();
  };

  const handleDelete = async (id: string) => {
    await deleteTodo(id);
    onProgressChange();
  };

  const startEdit = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditValue(currentTitle);
  };

  const saveEdit = async (id: string) => {
    if (editValue.trim() && editValue.trim() !== todos.find(t => t.id === id)?.title) {
      await updateTodo(id, editValue.trim());
    }
    setEditingId(null);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') saveEdit(id);
    if (e.key === 'Escape') setEditingId(null);
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    if (result.source.index === result.destination.index) return;
    reorder(result.source.index, result.destination.index);
  };

  if (loading) {
    return <div style={{ color: 'var(--text-muted)' }}>Loading...</div>;
  }

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Todos</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
        Simple tasks not tied to any learning area.
      </p>

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          ref={inputRef}
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          placeholder="Add a todo..."
          style={{ flex: 1, fontSize: 14 }}
        />
        <button
          type="submit"
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            background: TODO_COLOR,
            color: '#fff',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Add
        </button>
      </form>

      {todos.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>No todos. Add something above.</p>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="todos">
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              {todos.map((todo, index) => (
                <Draggable key={todo.id} draggableId={todo.id} index={index}>
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      style={{
                        ...provided.draggableProps.style,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 14px',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                      }}
                    >
                      {/* Cyan checkbox */}
                      <button
                        onClick={() => handleComplete(todo.id)}
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          border: `2px solid ${TODO_COLOR}`,
                          background: 'transparent',
                          flexShrink: 0,
                          cursor: 'pointer',
                        }}
                        title="Mark done"
                      />

                      {/* Title (editable) */}
                      <div style={{ flex: 1 }}>
                        {editingId === todo.id ? (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => saveEdit(todo.id)}
                            onKeyDown={e => handleEditKeyDown(e, todo.id)}
                            style={{ width: '100%', fontSize: 14 }}
                          />
                        ) : (
                          <span
                            onDoubleClick={() => startEdit(todo.id, todo.title)}
                            style={{ fontSize: 14, color: 'var(--text-primary)', cursor: 'text' }}
                          >
                            {todo.title}
                          </span>
                        )}
                      </div>

                      {/* Edit button */}
                      <button
                        onClick={() => startEdit(todo.id, todo.title)}
                        style={{ color: 'var(--text-muted)', fontSize: 14, padding: '2px 4px' }}
                        title="Edit"
                      >
                        ✏
                      </button>

                      {/* Delete button */}
                      <button
                        onClick={() => handleDelete(todo.id)}
                        style={{ color: 'var(--text-muted)', fontSize: 14, padding: '2px 4px' }}
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}
```

- [ ] **Step 2: Add "Todos" to Sidebar navItems**

In `frontend/src/components/Sidebar.tsx`, update `navItems`:
```ts
const navItems = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'backlog', label: 'Backlog' },
  { id: 'todos', label: 'Todos' },
  { id: 'archived', label: 'Archived' },
  { id: 'notes', label: 'Notes' },
  { id: 'history', label: 'History' },
];
```

- [ ] **Step 3: Add todos view to App.tsx renderView switch**

In `frontend/src/App.tsx`:

Add import:
```ts
import { TodosView } from './pages/TodosView';
```

Add case to `renderView` switch (after `'backlog'` case):
```ts
case 'todos':
  return <TodosView onProgressChange={refreshAll} />;
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/TodosView.tsx frontend/src/components/Sidebar.tsx frontend/src/App.tsx
git commit -m "feat: add TodosView page with add/complete/edit/delete/reorder"
```

---

## Task 8: Frontend — ProgressOverview split bars

**Files:**
- Modify: `frontend/src/components/ProgressOverview.tsx`

**Interfaces:**
- Consumes: `ProgressStats` with `learning` and `todos` fields (Task 2/5)
- Produces: segmented progress bar showing purple (learning) + cyan (todos) segments side by side

- [ ] **Step 1: Replace frontend/src/components/ProgressOverview.tsx**

```tsx
import { motion } from 'framer-motion';

const LEARNING_COLOR = '#6366f1';
const TODO_COLOR = '#06b6d4';

interface SegmentedBarProps {
  label: string;
  completed: number;
  total: number;
  learning: number;
  todos: number;
}

function SegmentedBar({ label, completed, total, learning, todos }: SegmentedBarProps) {
  const learningPct = total > 0 ? (learning / total) * 100 : 0;
  const todosPct = total > 0 ? (todos / total) * 100 : 0;

  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {label}: {completed}/{total}
        </span>
      </div>
      <div style={{ width: '100%', height: 8, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${learningPct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{
            height: '100%',
            background: LEARNING_COLOR,
            boxShadow: `0 0 10px ${LEARNING_COLOR}80`,
          }}
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${todosPct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
          style={{
            height: '100%',
            background: TODO_COLOR,
            boxShadow: `0 0 10px ${TODO_COLOR}80`,
          }}
        />
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
        <span style={{ fontSize: 11, color: LEARNING_COLOR }}>● Learning: {learning}</span>
        <span style={{ fontSize: 11, color: TODO_COLOR }}>● Todos: {todos}</span>
      </div>
    </div>
  );
}

interface ProgressOverviewProps {
  today: { completed: number; total: number; learning: number; todos: number };
  week: { completed: number; total: number; learning: number; todos: number };
}

export function ProgressOverview({ today, week }: ProgressOverviewProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 32,
        padding: '16px 24px',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <SegmentedBar
        label="Today"
        completed={today.completed}
        total={today.total}
        learning={today.learning}
        todos={today.todos}
      />
      <SegmentedBar
        label="This Week"
        completed={week.completed}
        total={week.total}
        learning={week.learning}
        todos={week.todos}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify App.tsx still passes correct shape to Layout**

In `App.tsx`, `progress={{ today: progress.today, week: progress.week }}` — `progress.today` and `progress.week` now include `learning` and `todos` fields, so this just works as the types are wider.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ProgressOverview.tsx
git commit -m "feat: split progress bars into learning (purple) + todos (cyan) segments"
```

---

## Task 9: Frontend — HistoryView all-time stats + split history bars

**Files:**
- Modify: `frontend/src/pages/HistoryView.tsx`

**Interfaces:**
- Consumes: `api.getAllTimeStats()` → `AllTimeStats`; updated history shape with `learning`/`todos` per entry (Tasks 4 & 5)

- [ ] **Step 1: Replace frontend/src/pages/HistoryView.tsx**

```tsx
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { api } from '../api/client';
import type { AllTimeStats } from '@shared/types';

const LEARNING_COLOR = '#6366f1';
const TODO_COLOR = '#06b6d4';

interface WeekData {
  week_start: string;
  completed: number;
  learning: number;
  todos: number;
}

interface DailyData {
  day: string;
  completed: number;
  learning: number;
  todos: number;
}

export function HistoryView() {
  const [weeks, setWeeks] = useState<WeekData[]>([]);
  const [daily, setDaily] = useState<DailyData[]>([]);
  const [allTime, setAllTime] = useState<AllTimeStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getProgressHistory(), api.getAllTimeStats()]).then(([history, stats]) => {
      setWeeks(history.weeks);
      setDaily(history.daily);
      setAllTime(stats);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div style={{ color: 'var(--text-muted)' }}>Loading...</div>;
  }

  const maxWeekly = Math.max(...weeks.map(w => w.completed), 1);
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const formatWeek = (dateStr: string) => {
    const date = new Date(dateStr);
    const end = new Date(date);
    end.setDate(date.getDate() + 6);
    return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  };

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>History</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
        Your completion history over time.
      </p>

      {/* All-Time Stats */}
      {allTime && (
        <div style={{ marginBottom: 36 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)' }}>
            All-Time
          </h3>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Total Completions', value: allTime.total_completions },
              { label: 'Learning', value: allTime.learning_completions, color: LEARNING_COLOR },
              { label: 'Todos Done', value: allTime.todo_completions, color: TODO_COLOR },
              { label: 'Current Streak', value: `${allTime.current_streak}d`, highlight: allTime.current_streak > 0 },
              { label: 'Longest Streak', value: `${allTime.longest_streak}d` },
              { label: 'Tasks Created', value: allTime.tasks_created },
              { label: 'Todos Created', value: allTime.todos_created },
            ].map(stat => (
              <div
                key={stat.label}
                style={{
                  padding: '12px 16px',
                  background: 'var(--bg-secondary)',
                  border: `1px solid ${stat.color ? stat.color + '40' : 'var(--border)'}`,
                  borderRadius: 8,
                  minWidth: 110,
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 700, color: stat.color || (stat.highlight ? '#f59e0b' : 'var(--text-primary)') }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily this week */}
      {daily.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)' }}>
            This Week (daily)
          </h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 120 }}>
            {dayNames.map((dayName, i) => {
              const dayData = daily.find(d => {
                const date = new Date(d.day);
                const dow = date.getDay();
                return (dow === 0 ? 6 : dow - 1) === i;
              });
              const learningCount = dayData?.learning || 0;
              const todosCount = dayData?.todos || 0;
              const total = learningCount + todosCount;
              const maxDaily = Math.max(...daily.map(d => d.completed), 1);
              const totalHeight = total > 0 ? Math.max(20, (total / maxDaily) * 100) : 4;
              const learningHeight = total > 0 ? (learningCount / total) * totalHeight : totalHeight;
              const todosHeight = total > 0 ? (todosCount / total) * totalHeight : 0;

              return (
                <div key={dayName} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{total || ''}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 40, gap: 0 }}>
                    {total === 0 ? (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 4 }}
                        transition={{ duration: 0.5, delay: i * 0.05 }}
                        style={{ width: '100%', background: 'var(--bg-tertiary)', borderRadius: 4 }}
                      />
                    ) : (
                      <>
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: todosHeight }}
                          transition={{ duration: 0.5, delay: i * 0.05 }}
                          style={{ width: '100%', background: TODO_COLOR, borderRadius: '4px 4px 0 0', boxShadow: `0 0 8px ${TODO_COLOR}40` }}
                        />
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: learningHeight }}
                          transition={{ duration: 0.5, delay: i * 0.05 + 0.05 }}
                          style={{ width: '100%', background: LEARNING_COLOR, borderRadius: todosHeight > 0 ? '0 0 4px 4px' : 4, boxShadow: `0 0 8px ${LEARNING_COLOR}40` }}
                        />
                      </>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{dayName}</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <span style={{ fontSize: 11, color: LEARNING_COLOR }}>● Learning</span>
            <span style={{ fontSize: 11, color: TODO_COLOR }}>● Todos</span>
          </div>
        </div>
      )}

      {/* Weekly summary */}
      <div>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)' }}>
          Weekly Summary
        </h3>
        {weeks.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No history yet. Complete some tasks to see your progress over time.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {weeks.map((week, i) => {
              const learningPct = (week.learning / maxWeekly) * 100;
              const todosPct = (week.todos / maxWeekly) * 100;
              const totalPct = learningPct + todosPct;
              return (
                <div key={week.week_start} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', width: 140, flexShrink: 0 }}>
                    {formatWeek(week.week_start)}
                  </span>
                  <div style={{ flex: 1, height: 24, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${learningPct}%` }}
                      transition={{ duration: 0.6, delay: i * 0.05 }}
                      style={{
                        height: '100%',
                        background: LEARNING_COLOR,
                        boxShadow: `0 0 8px ${LEARNING_COLOR}60`,
                        display: 'flex',
                        alignItems: 'center',
                        paddingLeft: 8,
                      }}
                    >
                      {learningPct > 10 && (
                        <span style={{ fontSize: 11, fontWeight: 600 }}>{week.learning}</span>
                      )}
                    </motion.div>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${todosPct}%` }}
                      transition={{ duration: 0.6, delay: i * 0.05 + 0.1 }}
                      style={{
                        height: '100%',
                        background: TODO_COLOR,
                        boxShadow: `0 0 8px ${TODO_COLOR}60`,
                        display: 'flex',
                        alignItems: 'center',
                        paddingLeft: learningPct > 0 ? 4 : 8,
                      }}
                    >
                      {todosPct > 10 && (
                        <span style={{ fontSize: 11, fontWeight: 600 }}>{week.todos}</span>
                      )}
                    </motion.div>
                  </div>
                  {totalPct <= 10 && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 24 }}>{week.completed}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <span style={{ fontSize: 11, color: LEARNING_COLOR }}>● Learning</span>
          <span style={{ fontSize: 11, color: TODO_COLOR }}>● Todos</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/HistoryView.tsx
git commit -m "feat: add all-time stats and split learning/todos bars to HistoryView"
```

---

## Task 10: Final verification

- [ ] **Step 1: Check TypeScript compiles with no errors**

```bash
cd /Users/e161739/ClaudeWorkspace/progress-app/frontend && npx tsc --noEmit 2>&1
cd /Users/e161739/ClaudeWorkspace/progress-app/backend && npx tsc --noEmit 2>&1
```
Expected: no output (no errors).

- [ ] **Step 2: Restart containers to pick up backend changes**

```bash
docker compose -f /Users/e161739/ClaudeWorkspace/progress-app/docker-compose.yml restart backend
```

- [ ] **Step 3: Smoke-test in browser**

Open `http://localhost:3000` and verify:
1. "Todos" appears in sidebar — clicking shows the TodosView
2. Add a todo → appears in list
3. Check a todo → it disappears from list
4. Top bar (ProgressOverview) shows split segments after adding/completing todos
5. History page shows all-time stats row at top
6. History bars have two color segments if you have both tasks and todos completed

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: todos and enhanced statistics — complete implementation"
```
