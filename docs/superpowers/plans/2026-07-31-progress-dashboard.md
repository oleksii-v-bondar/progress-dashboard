# Progress Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Dockerized personal development dashboard with React frontend, Express backend, and PostgreSQL database for tracking self-improvement tasks across areas and skills.

**Architecture:** Monorepo with three Docker services (frontend, backend, db) sharing TypeScript types. Backend exposes REST API consumed by a React SPA with drag-and-drop task management and animated progress bars.

**Tech Stack:** React 18, TypeScript, Vite, react-beautiful-dnd, framer-motion, Node.js, Express, Knex, PostgreSQL 16, Docker Compose

## Global Constraints

- Node 20 LTS for frontend and backend
- PostgreSQL 16
- All IDs are UUIDs (generated via `crypto.randomUUID()` or `gen_random_uuid()` in Postgres)
- No authentication — single-user tool
- Dark theme only — background #0f0f1a, cards #1a1a2e
- Week boundaries: Monday through Sunday
- TypeScript strict mode in both frontend and backend

---

### Task 1: Project Scaffolding & Docker Setup

**Files:**
- Create: `docker-compose.yml`
- Create: `frontend/Dockerfile`
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `backend/Dockerfile`
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/src/index.ts`
- Create: `shared/types.ts`
- Create: `database/init.sql`

**Interfaces:**
- Consumes: nothing (first task)
- Produces:
  - `shared/types.ts` exports: `Area`, `Skill`, `Task`, `Completion`, `TaskStatus`, `ProgressStats`
  - `docker-compose.yml` defines services: `frontend` (port 3000), `backend` (port 4000), `db` (port 5432)
  - Backend responds to `GET /api/health` → `{ status: "ok" }`

- [ ] **Step 1: Create shared types**

```typescript
// shared/types.ts
export type TaskStatus = 'backlog' | 'this_week' | 'today';

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

export interface Completion {
  id: string;
  task_id: string;
  completed_at: string;
}

export interface ProgressStats {
  completed: number;
  total: number;
}

export interface AreaProgress {
  area_id: string;
  area_name: string;
  color: string;
  completed: number;
  total: number;
}
```

- [ ] **Step 2: Create database init script**

```sql
-- database/init.sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TYPE task_status AS ENUM ('backlog', 'this_week', 'today');

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status task_status NOT NULL DEFAULT 'backlog',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  completed_at DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE(task_id, completed_at)
);
```

- [ ] **Step 3: Create backend package.json and tsconfig**

```json
// backend/package.json
{
  "name": "progress-backend",
  "version": "1.0.0",
  "scripts": {
    "dev": "nodemon --watch src --ext ts --exec ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "knex": "^3.1.0",
    "pg": "^8.11.3"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.11.0",
    "nodemon": "^3.0.2",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.3"
  }
}
```

```json
// backend/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "paths": {
      "@shared/*": ["../shared/*"]
    },
    "baseUrl": "."
  },
  "include": ["src/**/*", "../shared/**/*"]
}
```

- [ ] **Step 4: Create backend entry point**

```typescript
// backend/src/index.ts
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

export default app;
```

- [ ] **Step 5: Create backend Dockerfile**

```dockerfile
# backend/Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/
COPY ../shared/ ./shared/ 

EXPOSE 4000

CMD ["npm", "run", "dev"]
```

- [ ] **Step 6: Create frontend package.json and config**

```json
// frontend/package.json
{
  "name": "progress-frontend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@hello-pangea/dnd": "^16.6.0",
    "framer-motion": "^11.0.3",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.48",
    "@types/react-dom": "^18.2.18",
    "@vitejs/plugin-react": "^4.2.1",
    "typescript": "^5.3.3",
    "vite": "^5.0.12"
  }
}
```

```json
// frontend/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@shared/*": ["../shared/*"]
    },
    "baseUrl": "."
  },
  "include": ["src", "../shared"]
}
```

```typescript
// frontend/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://backend:4000',
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 7: Create frontend entry files**

```html
<!-- frontend/index.html -->
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Progress Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```tsx
// frontend/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

```tsx
// frontend/src/App.tsx
function App() {
  return (
    <div style={{ background: '#0f0f1a', color: '#e2e8f0', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <h1>Progress Dashboard</h1>
    </div>
  );
}

export default App;
```

- [ ] **Step 8: Create frontend Dockerfile**

```dockerfile
# frontend/Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
```

- [ ] **Step 9: Create docker-compose.yml**

```yaml
# docker-compose.yml
version: '3.8'

services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: progress
      POSTGRES_USER: progress
      POSTGRES_PASSWORD: progress
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./database/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U progress"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile
    ports:
      - "4000:4000"
    environment:
      DB_HOST: db
      DB_PORT: 5432
      DB_USER: progress
      DB_PASSWORD: progress
      DB_NAME: progress
      PORT: 4000
    volumes:
      - ./backend/src:/app/src
      - ./shared:/app/shared
    depends_on:
      db:
        condition: service_healthy

  frontend:
    build:
      context: .
      dockerfile: frontend/Dockerfile
    ports:
      - "3000:3000"
    volumes:
      - ./frontend/src:/app/src
      - ./frontend/index.html:/app/index.html
      - ./shared:/shared
    depends_on:
      - backend

volumes:
  pgdata:
```

- [ ] **Step 10: Verify Docker setup**

Run: `docker-compose up --build -d`

Expected: All three services start. Then:

Run: `curl http://localhost:4000/api/health`

Expected: `{"status":"ok"}`

Run: `curl http://localhost:3000`

Expected: HTML with "Progress Dashboard"

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: project scaffolding with Docker setup

- Docker Compose with frontend, backend, and PostgreSQL services
- Shared TypeScript types
- Database schema with areas, skills, tasks, completions
- Basic Express health endpoint
- Vite React app placeholder"
```

---

### Task 2: Backend Database Layer & Area/Skill CRUD

**Files:**
- Create: `backend/src/db/knex.ts`
- Create: `backend/src/routes/areas.ts`
- Create: `backend/src/routes/skills.ts`
- Modify: `backend/src/index.ts` (register routes)

**Interfaces:**
- Consumes: `shared/types.ts` (Area, Skill), database schema from `database/init.sql`
- Produces:
  - `GET /api/areas` → `Array<Area & { skills: Array<Skill & { task_count: number }> }>`
  - `POST /api/areas` (body: `{ name: string, color: string }`) → `Area`
  - `PUT /api/areas/:id` (body: `{ name?: string, color?: string }`) → `Area`
  - `DELETE /api/areas/:id` → `{ success: true }`
  - `POST /api/areas/:id/skills` (body: `{ name: string }`) → `Skill`
  - `PUT /api/skills/:id` (body: `{ name?: string }`) → `Skill`
  - `DELETE /api/skills/:id` → `{ success: true }`

- [ ] **Step 1: Create Knex configuration**

```typescript
// backend/src/db/knex.ts
import Knex from 'knex';

const db = Knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'progress',
    password: process.env.DB_PASSWORD || 'progress',
    database: process.env.DB_NAME || 'progress',
  },
});

export default db;
```

- [ ] **Step 2: Create areas route**

```typescript
// backend/src/routes/areas.ts
import { Router } from 'express';
import db from '../db/knex';

const router = Router();

router.get('/', async (_req, res) => {
  const areas = await db('areas').orderBy('created_at', 'asc');

  const areasWithSkills = await Promise.all(
    areas.map(async (area) => {
      const skills = await db('skills')
        .where('area_id', area.id)
        .orderBy('created_at', 'asc');

      const skillsWithCount = await Promise.all(
        skills.map(async (skill) => {
          const [{ count }] = await db('tasks')
            .where('skill_id', skill.id)
            .count('id as count');
          return { ...skill, task_count: Number(count) };
        })
      );

      return { ...area, skills: skillsWithCount };
    })
  );

  res.json(areasWithSkills);
});

router.post('/', async (req, res) => {
  const { name, color } = req.body;
  const [area] = await db('areas').insert({ name, color }).returning('*');
  res.status(201).json(area);
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, color } = req.body;
  const [area] = await db('areas').where({ id }).update({ name, color }).returning('*');
  if (!area) return res.status(404).json({ error: 'Area not found' });
  res.json(area);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  await db('areas').where({ id }).del();
  res.json({ success: true });
});

export default router;
```

- [ ] **Step 3: Create skills route**

```typescript
// backend/src/routes/skills.ts
import { Router } from 'express';
import db from '../db/knex';

const router = Router();

// Create skill within an area
router.post('/areas/:id/skills', async (req, res) => {
  const { id: area_id } = req.params;
  const { name } = req.body;
  const [skill] = await db('skills').insert({ area_id, name }).returning('*');
  res.status(201).json(skill);
});

// Update skill
router.put('/skills/:id', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  const [skill] = await db('skills').where({ id }).update({ name }).returning('*');
  if (!skill) return res.status(404).json({ error: 'Skill not found' });
  res.json(skill);
});

// Delete skill
router.delete('/skills/:id', async (req, res) => {
  const { id } = req.params;
  await db('skills').where({ id }).del();
  res.json({ success: true });
});

export default router;
```

- [ ] **Step 4: Register routes in index.ts**

```typescript
// backend/src/index.ts
import express from 'express';
import cors from 'cors';
import areasRouter from './routes/areas';
import skillsRouter from './routes/skills';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/areas', areasRouter);
app.use('/api', skillsRouter);

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

export default app;
```

- [ ] **Step 5: Verify endpoints**

Run: `docker-compose up --build -d`

Then test:
```bash
# Create area
curl -X POST http://localhost:4000/api/areas \
  -H "Content-Type: application/json" \
  -d '{"name":"Communication","color":"#6366f1"}'

# List areas
curl http://localhost:4000/api/areas
```

Expected: Area created with UUID, then listed with empty skills array.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: backend CRUD for areas and skills

- Knex database connection
- Areas routes (list, create, update, delete)
- Skills routes (create, update, delete)
- Areas list includes nested skills with task counts"
```

---

### Task 3: Backend Tasks & Completions CRUD

**Files:**
- Create: `backend/src/routes/tasks.ts`
- Create: `backend/src/routes/completions.ts`
- Modify: `backend/src/index.ts` (register new routes)

**Interfaces:**
- Consumes: `shared/types.ts` (Task, Completion, TaskStatus), database schema
- Produces:
  - `GET /api/tasks?status=today&area_id=X&skill_id=Y` → `Array<Task & { skill_name: string, area_name: string, area_color: string, completed_today: boolean }>`
  - `POST /api/tasks` (body: `{ skill_id, name, description?, status? }`) → `Task`
  - `PUT /api/tasks/:id` (body: `{ name?, description?, status? }`) → `Task`
  - `PATCH /api/tasks/:id/move` (body: `{ status: TaskStatus }`) → `Task`
  - `DELETE /api/tasks/:id` → `{ success: true }`
  - `POST /api/tasks/:id/complete` → `Completion`
  - `DELETE /api/tasks/:id/complete` → `{ success: true }`

- [ ] **Step 1: Create tasks route**

```typescript
// backend/src/routes/tasks.ts
import { Router } from 'express';
import db from '../db/knex';

const router = Router();

router.get('/', async (req, res) => {
  const { status, area_id, skill_id } = req.query;

  let query = db('tasks')
    .join('skills', 'tasks.skill_id', 'skills.id')
    .join('areas', 'skills.area_id', 'areas.id')
    .select(
      'tasks.*',
      'skills.name as skill_name',
      'areas.name as area_name',
      'areas.color as area_color'
    )
    .orderBy('tasks.created_at', 'asc');

  if (status) query = query.where('tasks.status', status as string);
  if (area_id) query = query.where('areas.id', area_id as string);
  if (skill_id) query = query.where('tasks.skill_id', skill_id as string);

  const tasks = await query;

  // Check today's completions
  const today = new Date().toISOString().split('T')[0];
  const completions = await db('completions')
    .whereIn('task_id', tasks.map(t => t.id))
    .where('completed_at', today);

  const completedIds = new Set(completions.map(c => c.task_id));

  const tasksWithCompletion = tasks.map(task => ({
    ...task,
    completed_today: completedIds.has(task.id),
  }));

  res.json(tasksWithCompletion);
});

router.post('/', async (req, res) => {
  const { skill_id, name, description, status } = req.body;
  const [task] = await db('tasks')
    .insert({ skill_id, name, description, status: status || 'backlog' })
    .returning('*');
  res.status(201).json(task);
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, status } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (status !== undefined) updates.status = status;

  const [task] = await db('tasks').where({ id }).update(updates).returning('*');
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

router.patch('/:id/move', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const [task] = await db('tasks').where({ id }).update({ status }).returning('*');
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  await db('tasks').where({ id }).del();
  res.json({ success: true });
});

export default router;
```

- [ ] **Step 2: Create completions route**

```typescript
// backend/src/routes/completions.ts
import { Router } from 'express';
import db from '../db/knex';

const router = Router();

router.post('/:id/complete', async (req, res) => {
  const { id } = req.params;
  const today = new Date().toISOString().split('T')[0];

  const existing = await db('completions')
    .where({ task_id: id, completed_at: today })
    .first();

  if (existing) {
    return res.json(existing);
  }

  const [completion] = await db('completions')
    .insert({ task_id: id, completed_at: today })
    .returning('*');
  res.status(201).json(completion);
});

router.delete('/:id/complete', async (req, res) => {
  const { id } = req.params;
  const today = new Date().toISOString().split('T')[0];

  await db('completions')
    .where({ task_id: id, completed_at: today })
    .del();
  res.json({ success: true });
});

export default router;
```

- [ ] **Step 3: Register new routes**

Update `backend/src/index.ts` — add after existing route registrations:

```typescript
import tasksRouter from './routes/tasks';
import completionsRouter from './routes/completions';

// ... existing registrations ...

app.use('/api/tasks', tasksRouter);
app.use('/api/tasks', completionsRouter);
```

- [ ] **Step 4: Verify task and completion flow**

```bash
# Create a task (use skill_id from earlier)
curl -X POST http://localhost:4000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"skill_id":"<SKILL_UUID>","name":"Explain a topic aloud for 5 min","status":"today"}'

# List today's tasks
curl "http://localhost:4000/api/tasks?status=today"

# Complete task
curl -X POST http://localhost:4000/api/tasks/<TASK_UUID>/complete

# Verify completed_today is true
curl "http://localhost:4000/api/tasks?status=today"
```

Expected: Task shows `completed_today: true` after completion.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: backend CRUD for tasks and completions

- Tasks route with filtering by status, area, skill
- Move endpoint for drag-and-drop status changes
- Completions with idempotent daily check-off
- Tasks include completed_today flag"
```

---

### Task 4: Backend Progress Endpoints

**Files:**
- Create: `backend/src/routes/progress.ts`
- Modify: `backend/src/index.ts` (register route)

**Interfaces:**
- Consumes: `shared/types.ts` (ProgressStats, AreaProgress), database schema
- Produces:
  - `GET /api/progress/today` → `ProgressStats` (completed count and total of today's tasks)
  - `GET /api/progress/week` → `ProgressStats` (completions this week vs total this_week+today tasks)
  - `GET /api/progress/areas` → `AreaProgress[]` (per-area completion stats)

- [ ] **Step 1: Create progress route**

```typescript
// backend/src/routes/progress.ts
import { Router } from 'express';
import db from '../db/knex';

const router = Router();

router.get('/today', async (_req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const [{ count: total }] = await db('tasks')
    .where('status', 'today')
    .count('id as count');

  const [{ count: completed }] = await db('completions')
    .join('tasks', 'completions.task_id', 'tasks.id')
    .where('tasks.status', 'today')
    .where('completions.completed_at', today)
    .count('completions.id as count');

  res.json({ completed: Number(completed), total: Number(total) });
});

router.get('/week', async (_req, res) => {
  // Get Monday of current week
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);
  const mondayStr = monday.toISOString().split('T')[0];
  const todayStr = now.toISOString().split('T')[0];

  // Total = all tasks in today + this_week status
  const [{ count: total }] = await db('tasks')
    .whereIn('status', ['today', 'this_week'])
    .count('id as count');

  // Completed = completions this week for tasks in today/this_week
  const [{ count: completed }] = await db('completions')
    .join('tasks', 'completions.task_id', 'tasks.id')
    .whereIn('tasks.status', ['today', 'this_week'])
    .where('completions.completed_at', '>=', mondayStr)
    .where('completions.completed_at', '<=', todayStr)
    .count('completions.id as count');

  res.json({ completed: Number(completed), total: Number(total) });
});

router.get('/areas', async (_req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const areas = await db('areas').orderBy('created_at', 'asc');

  const areaProgress = await Promise.all(
    areas.map(async (area) => {
      const [{ count: total }] = await db('tasks')
        .join('skills', 'tasks.skill_id', 'skills.id')
        .where('skills.area_id', area.id)
        .where('tasks.status', 'today')
        .count('tasks.id as count');

      const [{ count: completed }] = await db('completions')
        .join('tasks', 'completions.task_id', 'tasks.id')
        .join('skills', 'tasks.skill_id', 'skills.id')
        .where('skills.area_id', area.id)
        .where('tasks.status', 'today')
        .where('completions.completed_at', today)
        .count('completions.id as count');

      return {
        area_id: area.id,
        area_name: area.name,
        color: area.color,
        completed: Number(completed),
        total: Number(total),
      };
    })
  );

  res.json(areaProgress);
});

export default router;
```

- [ ] **Step 2: Register progress route**

Add to `backend/src/index.ts`:

```typescript
import progressRouter from './routes/progress';

// ... existing registrations ...

app.use('/api/progress', progressRouter);
```

- [ ] **Step 3: Verify progress endpoints**

```bash
curl http://localhost:4000/api/progress/today
curl http://localhost:4000/api/progress/week
curl http://localhost:4000/api/progress/areas
```

Expected: JSON with `completed` and `total` fields (values depend on test data).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: progress endpoints for today, week, and per-area stats"
```

---

### Task 5: Frontend API Client & Hooks

**Files:**
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/hooks/useAreas.ts`
- Create: `frontend/src/hooks/useTasks.ts`
- Create: `frontend/src/hooks/useProgress.ts`

**Interfaces:**
- Consumes: Backend API endpoints, `shared/types.ts`
- Produces:
  - `useAreas()` → `{ areas, createArea, updateArea, deleteArea, createSkill, deleteSkill, loading }`
  - `useTasks(filters?)` → `{ tasks, createTask, updateTask, moveTask, deleteTask, toggleComplete, loading }`
  - `useProgress()` → `{ today, week, areas, refresh }`

- [ ] **Step 1: Create API client**

```typescript
// frontend/src/api/client.ts
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
  getAreas: () => request<any[]>('/areas'),
  createArea: (data: { name: string; color: string }) =>
    request<any>('/areas', { method: 'POST', body: JSON.stringify(data) }),
  updateArea: (id: string, data: { name?: string; color?: string }) =>
    request<any>(`/areas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteArea: (id: string) =>
    request<any>(`/areas/${id}`, { method: 'DELETE' }),

  // Skills
  createSkill: (areaId: string, data: { name: string }) =>
    request<any>(`/areas/${areaId}/skills`, { method: 'POST', body: JSON.stringify(data) }),
  updateSkill: (id: string, data: { name: string }) =>
    request<any>(`/skills/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSkill: (id: string) =>
    request<any>(`/skills/${id}`, { method: 'DELETE' }),

  // Tasks
  getTasks: (params?: { status?: string; area_id?: string; skill_id?: string }) => {
    const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return request<any[]>(`/tasks${query}`);
  },
  createTask: (data: { skill_id: string; name: string; description?: string; status?: string }) =>
    request<any>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id: string, data: { name?: string; description?: string; status?: string }) =>
    request<any>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  moveTask: (id: string, status: string) =>
    request<any>(`/tasks/${id}/move`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteTask: (id: string) =>
    request<any>(`/tasks/${id}`, { method: 'DELETE' }),

  // Completions
  completeTask: (id: string) =>
    request<any>(`/tasks/${id}/complete`, { method: 'POST' }),
  uncompleteTask: (id: string) =>
    request<any>(`/tasks/${id}/complete`, { method: 'DELETE' }),

  // Progress
  getProgressToday: () => request<{ completed: number; total: number }>('/progress/today'),
  getProgressWeek: () => request<{ completed: number; total: number }>('/progress/week'),
  getProgressAreas: () => request<any[]>('/progress/areas'),
};
```

- [ ] **Step 2: Create useAreas hook**

```typescript
// frontend/src/hooks/useAreas.ts
import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

export function useAreas() {
  const [areas, setAreas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAreas = useCallback(async () => {
    setLoading(true);
    const data = await api.getAreas();
    setAreas(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAreas(); }, [fetchAreas]);

  const createArea = async (name: string, color: string) => {
    await api.createArea({ name, color });
    await fetchAreas();
  };

  const updateArea = async (id: string, data: { name?: string; color?: string }) => {
    await api.updateArea(id, data);
    await fetchAreas();
  };

  const deleteArea = async (id: string) => {
    await api.deleteArea(id);
    await fetchAreas();
  };

  const createSkill = async (areaId: string, name: string) => {
    await api.createSkill(areaId, { name });
    await fetchAreas();
  };

  const deleteSkill = async (id: string) => {
    await api.deleteSkill(id);
    await fetchAreas();
  };

  return { areas, createArea, updateArea, deleteArea, createSkill, deleteSkill, loading, refresh: fetchAreas };
}
```

- [ ] **Step 3: Create useTasks hook**

```typescript
// frontend/src/hooks/useTasks.ts
import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

interface TaskFilters {
  status?: string;
  area_id?: string;
  skill_id?: string;
}

export function useTasks(filters?: TaskFilters) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const data = await api.getTasks(filters);
    setTasks(data);
    setLoading(false);
  }, [filters?.status, filters?.area_id, filters?.skill_id]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const createTask = async (data: { skill_id: string; name: string; description?: string; status?: string }) => {
    await api.createTask(data);
    await fetchTasks();
  };

  const updateTask = async (id: string, data: { name?: string; description?: string }) => {
    await api.updateTask(id, data);
    await fetchTasks();
  };

  const moveTask = async (id: string, status: string) => {
    await api.moveTask(id, status);
    await fetchTasks();
  };

  const deleteTask = async (id: string) => {
    await api.deleteTask(id);
    await fetchTasks();
  };

  const toggleComplete = async (id: string, currentlyCompleted: boolean) => {
    if (currentlyCompleted) {
      await api.uncompleteTask(id);
    } else {
      await api.completeTask(id);
    }
    await fetchTasks();
  };

  return { tasks, createTask, updateTask, moveTask, deleteTask, toggleComplete, loading, refresh: fetchTasks };
}
```

- [ ] **Step 4: Create useProgress hook**

```typescript
// frontend/src/hooks/useProgress.ts
import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

interface ProgressData {
  today: { completed: number; total: number };
  week: { completed: number; total: number };
  areas: Array<{ area_id: string; area_name: string; color: string; completed: number; total: number }>;
}

export function useProgress() {
  const [data, setData] = useState<ProgressData>({
    today: { completed: 0, total: 0 },
    week: { completed: 0, total: 0 },
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

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: frontend API client and React hooks

- API client with typed methods for all endpoints
- useAreas hook for area/skill CRUD
- useTasks hook with filtering and completion toggle
- useProgress hook for dashboard stats"
```

---

### Task 6: Frontend Layout Shell & Dark Theme

**Files:**
- Create: `frontend/src/styles/global.css`
- Create: `frontend/src/components/Layout.tsx`
- Create: `frontend/src/components/Sidebar.tsx`
- Create: `frontend/src/components/ProgressBar.tsx`
- Create: `frontend/src/components/ProgressOverview.tsx`
- Modify: `frontend/src/App.tsx` (use Layout)
- Modify: `frontend/src/main.tsx` (import global CSS)

**Interfaces:**
- Consumes: `useAreas()`, `useProgress()`
- Produces:
  - `<Layout>` component wrapping the app with sidebar + top bar + main content
  - `<Sidebar>` showing areas list with add button, navigation between views
  - `<ProgressBar value={0-100} color={hex} label={string} />` reusable animated bar
  - `<ProgressOverview>` top bar with today/week bars

- [ ] **Step 1: Create global CSS with dark theme**

```css
/* frontend/src/styles/global.css */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --bg-primary: #0f0f1a;
  --bg-secondary: #1a1a2e;
  --bg-tertiary: #252540;
  --text-primary: #e2e8f0;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --border: #2d2d4a;
  --accent: #6366f1;
  --success: #10b981;
  --danger: #ef4444;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  min-height: 100vh;
}

button {
  cursor: pointer;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
}

input, textarea {
  font: inherit;
  color: inherit;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 12px;
  outline: none;
}

input:focus, textarea:focus {
  border-color: var(--accent);
}
```

- [ ] **Step 2: Create ProgressBar component**

```tsx
// frontend/src/components/ProgressBar.tsx
import { motion } from 'framer-motion';

interface ProgressBarProps {
  value: number; // 0-100
  color: string;
  label?: string;
  showPercentage?: boolean;
}

export function ProgressBar({ value, color, label, showPercentage = true }: ProgressBarProps) {
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div style={{ width: '100%' }}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
          {showPercentage && (
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{Math.round(clampedValue)}%</span>
          )}
        </div>
      )}
      <div
        style={{
          width: '100%',
          height: 8,
          background: 'var(--bg-tertiary)',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${clampedValue}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{
            height: '100%',
            background: color,
            borderRadius: 4,
            boxShadow: `0 0 10px ${color}80, 0 0 20px ${color}40`,
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create ProgressOverview component**

```tsx
// frontend/src/components/ProgressOverview.tsx
import { ProgressBar } from './ProgressBar';

interface ProgressOverviewProps {
  today: { completed: number; total: number };
  week: { completed: number; total: number };
}

export function ProgressOverview({ today, week }: ProgressOverviewProps) {
  const todayPct = today.total > 0 ? (today.completed / today.total) * 100 : 0;
  const weekPct = week.total > 0 ? (week.completed / week.total) * 100 : 0;

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
      <div style={{ flex: 1 }}>
        <ProgressBar
          value={todayPct}
          color="#6366f1"
          label={`Today: ${today.completed}/${today.total}`}
        />
      </div>
      <div style={{ flex: 1 }}>
        <ProgressBar
          value={weekPct}
          color="#8b5cf6"
          label={`This Week: ${week.completed}/${week.total}`}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create Sidebar component**

```tsx
// frontend/src/components/Sidebar.tsx
import { useState } from 'react';

interface SidebarProps {
  areas: Array<{ id: string; name: string; color: string }>;
  currentView: string;
  onViewChange: (view: string) => void;
  onAreaSelect: (areaId: string) => void;
  onCreateArea: (name: string, color: string) => void;
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4'];

export function Sidebar({ areas, currentView, onViewChange, onAreaSelect, onCreateArea }: SidebarProps) {
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      onCreateArea(newName.trim(), newColor);
      setNewName('');
      setShowForm(false);
    }
  };

  const navItems = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'This Week' },
    { id: 'backlog', label: 'Backlog' },
  ];

  return (
    <aside
      style={{
        width: 240,
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
        padding: '20px 0',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
      }}
    >
      <div style={{ padding: '0 16px', marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>Progress</h1>
      </div>

      <nav style={{ padding: '0 8px', marginBottom: 24 }}>
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '10px 12px',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: currentView === item.id ? 600 : 400,
              background: currentView === item.id ? 'var(--bg-tertiary)' : 'transparent',
              color: currentView === item.id ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div style={{ padding: '0 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Areas
          </span>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{ fontSize: 18, color: 'var(--text-muted)', lineHeight: 1 }}
          >
            +
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} style={{ marginBottom: 12 }}>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Area name"
              autoFocus
              style={{ width: '100%', marginBottom: 8, fontSize: 13 }}
            />
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: c,
                    border: newColor === c ? '2px solid white' : '2px solid transparent',
                  }}
                />
              ))}
            </div>
            <button
              type="submit"
              style={{
                width: '100%',
                padding: '6px',
                borderRadius: 6,
                background: 'var(--accent)',
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              Add Area
            </button>
          </form>
        )}

        {areas.map(area => (
          <button
            key={area.id}
            onClick={() => onAreaSelect(area.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              textAlign: 'left',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 14,
              color: 'var(--text-secondary)',
              background: currentView === `area-${area.id}` ? 'var(--bg-tertiary)' : 'transparent',
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: area.color }} />
            {area.name}
          </button>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 5: Create Layout component**

```tsx
// frontend/src/components/Layout.tsx
import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { ProgressOverview } from './ProgressOverview';

interface LayoutProps {
  children: ReactNode;
  areas: Array<{ id: string; name: string; color: string }>;
  currentView: string;
  onViewChange: (view: string) => void;
  onAreaSelect: (areaId: string) => void;
  onCreateArea: (name: string, color: string) => void;
  progress: {
    today: { completed: number; total: number };
    week: { completed: number; total: number };
  };
}

export function Layout({ children, areas, currentView, onViewChange, onAreaSelect, onCreateArea, progress }: LayoutProps) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
        areas={areas}
        currentView={currentView}
        onViewChange={onViewChange}
        onAreaSelect={onAreaSelect}
        onCreateArea={onCreateArea}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <ProgressOverview today={progress.today} week={progress.week} />
        <main style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Update App.tsx with Layout**

```tsx
// frontend/src/App.tsx
import { useState } from 'react';
import { Layout } from './components/Layout';
import { useAreas } from './hooks/useAreas';
import { useProgress } from './hooks/useProgress';

function App() {
  const [currentView, setCurrentView] = useState('today');
  const { areas, createArea } = useAreas();
  const progress = useProgress();

  const handleAreaSelect = (areaId: string) => {
    setCurrentView(`area-${areaId}`);
  };

  return (
    <Layout
      areas={areas}
      currentView={currentView}
      onViewChange={setCurrentView}
      onAreaSelect={handleAreaSelect}
      onCreateArea={createArea}
      progress={{ today: progress.today, week: progress.week }}
    >
      <div style={{ color: 'var(--text-secondary)' }}>
        <h2 style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
          {currentView === 'today' && 'Today'}
          {currentView === 'week' && 'This Week'}
          {currentView === 'backlog' && 'Backlog'}
          {currentView.startsWith('area-') && 'Area Detail'}
        </h2>
        <p>View content coming next...</p>
      </div>
    </Layout>
  );
}

export default App;
```

- [ ] **Step 7: Update main.tsx to import global CSS**

```tsx
// frontend/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 8: Verify layout renders**

Run: `docker-compose up --build -d`

Open browser to `http://localhost:3000`

Expected: Dark themed page with sidebar showing navigation items (Today, This Week, Backlog), an area creation form, and progress bars at the top (showing 0/0 initially).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: frontend layout shell with dark theme

- Global CSS with dark theme variables
- Layout component with sidebar and progress overview
- Sidebar with nav items and area creation form
- Animated ProgressBar component with glow effect
- ProgressOverview with today/week bars"
```

---

### Task 7: Today View with Task Cards & Completion

**Files:**
- Create: `frontend/src/components/TaskCard.tsx`
- Create: `frontend/src/pages/TodayView.tsx`
- Modify: `frontend/src/App.tsx` (render TodayView)

**Interfaces:**
- Consumes: `useTasks({ status: 'today' })`, `useProgress()`
- Produces:
  - `<TaskCard>` — displays task with checkbox, name, area badge, delete button
  - `<TodayView>` — lists today's tasks with completion toggles and area progress bars

- [ ] **Step 1: Create TaskCard component**

```tsx
// frontend/src/components/TaskCard.tsx
import { motion } from 'framer-motion';

interface TaskCardProps {
  id: string;
  name: string;
  description: string | null;
  skill_name: string;
  area_name: string;
  area_color: string;
  completed_today: boolean;
  onToggleComplete: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
}

export function TaskCard({
  id,
  name,
  description,
  skill_name,
  area_name,
  area_color,
  completed_today,
  onToggleComplete,
  onDelete,
}: TaskCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: 16,
        background: 'var(--bg-secondary)',
        borderRadius: 8,
        border: `1px solid ${completed_today ? area_color + '40' : 'var(--border)'}`,
        transition: 'border-color 0.2s',
      }}
    >
      <button
        onClick={() => onToggleComplete(id, completed_today)}
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          border: `2px solid ${completed_today ? area_color : 'var(--text-muted)'}`,
          background: completed_today ? area_color : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 2,
          transition: 'all 0.2s',
        }}
      >
        {completed_today && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 500,
            textDecoration: completed_today ? 'line-through' : 'none',
            opacity: completed_today ? 0.6 : 1,
            transition: 'all 0.2s',
          }}
        >
          {name}
        </div>
        {description && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {description}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <span
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 12,
              background: area_color + '20',
              color: area_color,
              fontWeight: 500,
            }}
          >
            {area_name}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {skill_name}
          </span>
        </div>
      </div>

      <button
        onClick={() => onDelete(id)}
        style={{
          fontSize: 16,
          color: 'var(--text-muted)',
          opacity: 0.5,
          padding: 4,
        }}
      >
        &times;
      </button>
    </motion.div>
  );
}
```

- [ ] **Step 2: Create TodayView page**

```tsx
// frontend/src/pages/TodayView.tsx
import { AnimatePresence } from 'framer-motion';
import { TaskCard } from '../components/TaskCard';
import { ProgressBar } from '../components/ProgressBar';
import { useTasks } from '../hooks/useTasks';

interface TodayViewProps {
  areaProgress: Array<{ area_id: string; area_name: string; color: string; completed: number; total: number }>;
  onProgressChange: () => void;
}

export function TodayView({ areaProgress, onProgressChange }: TodayViewProps) {
  const { tasks, toggleComplete, deleteTask, loading } = useTasks({ status: 'today' });

  const handleToggle = async (id: string, completed: boolean) => {
    await toggleComplete(id, completed);
    onProgressChange();
  };

  const handleDelete = async (id: string) => {
    await deleteTask(id);
    onProgressChange();
  };

  if (loading) {
    return <div style={{ color: 'var(--text-muted)' }}>Loading...</div>;
  }

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 20 }}>Today</h2>

      {tasks.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>
          No tasks for today. Move some from your backlog or weekly plan.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
          <AnimatePresence>
            {tasks.map(task => (
              <TaskCard
                key={task.id}
                {...task}
                onToggleComplete={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {areaProgress.length > 0 && (
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)' }}>
            Area Progress
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {areaProgress.filter(a => a.total > 0).map(area => (
              <ProgressBar
                key={area.area_id}
                value={area.total > 0 ? (area.completed / area.total) * 100 : 0}
                color={area.color}
                label={`${area.area_name}: ${area.completed}/${area.total}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update App.tsx to render TodayView**

Replace the placeholder content in App.tsx's `<Layout>` children:

```tsx
// frontend/src/App.tsx
import { useState } from 'react';
import { Layout } from './components/Layout';
import { useAreas } from './hooks/useAreas';
import { useProgress } from './hooks/useProgress';
import { TodayView } from './pages/TodayView';

function App() {
  const [currentView, setCurrentView] = useState('today');
  const { areas, createArea } = useAreas();
  const progress = useProgress();

  const handleAreaSelect = (areaId: string) => {
    setCurrentView(`area-${areaId}`);
  };

  const renderView = () => {
    switch (currentView) {
      case 'today':
        return <TodayView areaProgress={progress.areas} onProgressChange={progress.refresh} />;
      case 'week':
        return <div style={{ color: 'var(--text-muted)' }}>This Week view coming next...</div>;
      case 'backlog':
        return <div style={{ color: 'var(--text-muted)' }}>Backlog view coming next...</div>;
      default:
        return <div style={{ color: 'var(--text-muted)' }}>Area detail coming next...</div>;
    }
  };

  return (
    <Layout
      areas={areas}
      currentView={currentView}
      onViewChange={setCurrentView}
      onAreaSelect={handleAreaSelect}
      onCreateArea={createArea}
      progress={{ today: progress.today, week: progress.week }}
    >
      {renderView()}
    </Layout>
  );
}

export default App;
```

- [ ] **Step 4: Verify today view**

Open `http://localhost:3000`. Create an area, create a skill (via API), add a task with status "today", and verify:
- Task card renders with checkbox
- Clicking checkbox marks as complete (line-through, border glow)
- Progress bars update

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: Today view with task cards and completion

- TaskCard component with animated checkbox and area badge
- TodayView page with task list and area progress bars
- Completion toggle updates progress in real-time"
```

---

### Task 8: This Week & Backlog Views with Drag-and-Drop

**Files:**
- Create: `frontend/src/pages/WeekView.tsx`
- Create: `frontend/src/pages/BacklogView.tsx`
- Create: `frontend/src/components/AddTaskForm.tsx`
- Modify: `frontend/src/App.tsx` (render new views, wrap with DragDropContext)

**Interfaces:**
- Consumes: `useTasks()`, `useAreas()`, `@hello-pangea/dnd`
- Produces:
  - `<WeekView>` — shows this_week tasks, drag to move to today
  - `<BacklogView>` — all backlog tasks grouped by area/skill, add task form
  - `<AddTaskForm>` — inline form to create a task (select skill, enter name)

- [ ] **Step 1: Create AddTaskForm component**

```tsx
// frontend/src/components/AddTaskForm.tsx
import { useState } from 'react';

interface AddTaskFormProps {
  areas: Array<{ id: string; name: string; color: string; skills: Array<{ id: string; name: string }> }>;
  defaultStatus: string;
  onAdd: (data: { skill_id: string; name: string; description?: string; status: string }) => void;
}

export function AddTaskForm({ areas, defaultStatus, onAdd }: AddTaskFormProps) {
  const [name, setName] = useState('');
  const [skillId, setSkillId] = useState('');
  const [description, setDescription] = useState('');
  const [expanded, setExpanded] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && skillId) {
      onAdd({ skill_id: skillId, name: name.trim(), description: description.trim() || undefined, status: defaultStatus });
      setName('');
      setDescription('');
      setExpanded(false);
    }
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          borderRadius: 8,
          border: '1px dashed var(--border)',
          color: 'var(--text-muted)',
          fontSize: 14,
          width: '100%',
        }}
      >
        + Add task
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: 16,
        borderRadius: 8,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Task name"
        autoFocus
        style={{ fontSize: 14 }}
      />
      <input
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Description (optional)"
        style={{ fontSize: 13 }}
      />
      <select
        value={skillId}
        onChange={e => setSkillId(e.target.value)}
        style={{
          padding: '8px 12px',
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'var(--bg-tertiary)',
          color: 'var(--text-primary)',
          fontSize: 13,
        }}
      >
        <option value="">Select skill...</option>
        {areas.map(area => (
          <optgroup key={area.id} label={area.name}>
            {area.skills.map(skill => (
              <option key={skill.id} value={skill.id}>{skill.name}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="submit"
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            background: 'var(--accent)',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            background: 'var(--bg-tertiary)',
            fontSize: 13,
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create WeekView page**

```tsx
// frontend/src/pages/WeekView.tsx
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { TaskCard } from '../components/TaskCard';
import { useTasks } from '../hooks/useTasks';

interface WeekViewProps {
  onProgressChange: () => void;
}

export function WeekView({ onProgressChange }: WeekViewProps) {
  const { tasks, toggleComplete, deleteTask, loading } = useTasks({ status: 'this_week' });

  const handleToggle = async (id: string, completed: boolean) => {
    await toggleComplete(id, completed);
    onProgressChange();
  };

  const handleDelete = async (id: string) => {
    await deleteTask(id);
    onProgressChange();
  };

  if (loading) {
    return <div style={{ color: 'var(--text-muted)' }}>Loading...</div>;
  }

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>This Week</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
        Drag tasks to move them to Today.
      </p>

      <Droppable droppableId="week">
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            {tasks.length === 0 && (
              <p style={{ color: 'var(--text-muted)' }}>
                No tasks scheduled this week. Move some from your backlog.
              </p>
            )}
            {tasks.map((task, index) => (
              <Draggable key={task.id} draggableId={task.id} index={index}>
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                  >
                    <TaskCard
                      {...task}
                      onToggleComplete={handleToggle}
                      onDelete={handleDelete}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
```

- [ ] **Step 3: Create BacklogView page**

```tsx
// frontend/src/pages/BacklogView.tsx
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { AddTaskForm } from '../components/AddTaskForm';
import { useTasks } from '../hooks/useTasks';

interface BacklogViewProps {
  areas: Array<{ id: string; name: string; color: string; skills: Array<{ id: string; name: string }> }>;
  onProgressChange: () => void;
}

export function BacklogView({ areas, onProgressChange }: BacklogViewProps) {
  const { tasks, createTask, deleteTask, loading } = useTasks({ status: 'backlog' });

  const handleCreateTask = async (data: { skill_id: string; name: string; description?: string; status: string }) => {
    await createTask(data);
    onProgressChange();
  };

  const handleDelete = async (id: string) => {
    await deleteTask(id);
    onProgressChange();
  };

  if (loading) {
    return <div style={{ color: 'var(--text-muted)' }}>Loading...</div>;
  }

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Backlog</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
        Your pool of tasks. Drag them to This Week or Today when ready.
      </p>

      <div style={{ marginBottom: 20 }}>
        <AddTaskForm areas={areas} defaultStatus="backlog" onAdd={handleCreateTask} />
      </div>

      <Droppable droppableId="backlog">
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            {tasks.map((task, index) => (
              <Draggable key={task.id} draggableId={task.id} index={index}>
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: 16,
                        background: 'var(--bg-secondary)',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 500 }}>{task.name}</div>
                        {task.description && (
                          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                            {task.description}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <span
                            style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 12,
                              background: task.area_color + '20',
                              color: task.area_color,
                              fontWeight: 500,
                            }}
                          >
                            {task.area_name}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {task.skill_name}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(task.id)}
                        style={{ fontSize: 16, color: 'var(--text-muted)', opacity: 0.5, padding: 4 }}
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
```

- [ ] **Step 4: Update App.tsx with DragDropContext and all views**

```tsx
// frontend/src/App.tsx
import { useState, useCallback } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { Layout } from './components/Layout';
import { useAreas } from './hooks/useAreas';
import { useProgress } from './hooks/useProgress';
import { useTasks } from './hooks/useTasks';
import { TodayView } from './pages/TodayView';
import { WeekView } from './pages/WeekView';
import { BacklogView } from './pages/BacklogView';
import { api } from './api/client';

function App() {
  const [currentView, setCurrentView] = useState('today');
  const { areas, createArea } = useAreas();
  const progress = useProgress();
  const todayTasks = useTasks({ status: 'today' });
  const weekTasks = useTasks({ status: 'this_week' });
  const backlogTasks = useTasks({ status: 'backlog' });

  const handleAreaSelect = (areaId: string) => {
    setCurrentView(`area-${areaId}`);
  };

  const refreshAll = useCallback(() => {
    progress.refresh();
    todayTasks.refresh();
    weekTasks.refresh();
    backlogTasks.refresh();
  }, [progress, todayTasks, weekTasks, backlogTasks]);

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const { draggableId, destination } = result;
    const statusMap: Record<string, string> = {
      today: 'today',
      week: 'this_week',
      backlog: 'backlog',
    };
    const newStatus = statusMap[destination.droppableId];
    if (newStatus) {
      await api.moveTask(draggableId, newStatus);
      refreshAll();
    }
  };

  const renderView = () => {
    switch (currentView) {
      case 'today':
        return <TodayView areaProgress={progress.areas} onProgressChange={refreshAll} />;
      case 'week':
        return <WeekView onProgressChange={refreshAll} />;
      case 'backlog':
        return <BacklogView areas={areas} onProgressChange={refreshAll} />;
      default:
        return <div style={{ color: 'var(--text-muted)' }}>Area detail coming next...</div>;
    }
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Layout
        areas={areas}
        currentView={currentView}
        onViewChange={setCurrentView}
        onAreaSelect={handleAreaSelect}
        onCreateArea={createArea}
        progress={{ today: progress.today, week: progress.week }}
      >
        {renderView()}
      </Layout>
    </DragDropContext>
  );
}

export default App;
```

- [ ] **Step 5: Verify drag-and-drop flow**

Open `http://localhost:3000`:
1. Create area + skill (via sidebar and API)
2. Go to Backlog, add a task via the form
3. Drag the task — it should move between views
4. Check Today to see dragged tasks appear

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: Week and Backlog views with drag-and-drop

- WeekView with draggable task cards
- BacklogView with AddTaskForm and draggable tasks
- DragDropContext in App handles cross-view moves
- Tasks move between backlog/this_week/today via drag"
```

---

### Task 9: Area Detail View with Skill Management

**Files:**
- Create: `frontend/src/pages/AreaDetailView.tsx`
- Modify: `frontend/src/App.tsx` (render AreaDetailView)

**Interfaces:**
- Consumes: `useAreas()`, `useTasks({ area_id })`, area from areas list
- Produces:
  - `<AreaDetailView>` — shows area header, skills with add form, tasks per skill, area progress bar

- [ ] **Step 1: Create AreaDetailView page**

```tsx
// frontend/src/pages/AreaDetailView.tsx
import { useState } from 'react';
import { ProgressBar } from '../components/ProgressBar';
import { TaskCard } from '../components/TaskCard';
import { AddTaskForm } from '../components/AddTaskForm';
import { useTasks } from '../hooks/useTasks';

interface AreaDetailViewProps {
  area: { id: string; name: string; color: string; skills: Array<{ id: string; name: string }> };
  areaProgress: { completed: number; total: number } | undefined;
  onCreateSkill: (areaId: string, name: string) => void;
  onDeleteSkill: (id: string) => void;
  onProgressChange: () => void;
}

export function AreaDetailView({ area, areaProgress, onCreateSkill, onDeleteSkill, onProgressChange }: AreaDetailViewProps) {
  const [newSkillName, setNewSkillName] = useState('');
  const { tasks, createTask, toggleComplete, deleteTask } = useTasks({ area_id: area.id });

  const handleAddSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSkillName.trim()) {
      onCreateSkill(area.id, newSkillName.trim());
      setNewSkillName('');
    }
  };

  const handleToggle = async (id: string, completed: boolean) => {
    await toggleComplete(id, completed);
    onProgressChange();
  };

  const handleDelete = async (id: string) => {
    await deleteTask(id);
    onProgressChange();
  };

  const handleCreateTask = async (data: { skill_id: string; name: string; description?: string; status: string }) => {
    await createTask(data);
    onProgressChange();
  };

  const progressPct = areaProgress && areaProgress.total > 0
    ? (areaProgress.completed / areaProgress.total) * 100
    : 0;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <span style={{ width: 16, height: 16, borderRadius: '50%', background: area.color }} />
        <h2 style={{ fontSize: 24, fontWeight: 600 }}>{area.name}</h2>
      </div>

      {areaProgress && areaProgress.total > 0 && (
        <div style={{ marginBottom: 24 }}>
          <ProgressBar
            value={progressPct}
            color={area.color}
            label={`Today: ${areaProgress.completed}/${areaProgress.total} completed`}
          />
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
          Skills
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {area.skills.map(skill => (
            <span
              key={skill.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 16,
                background: area.color + '20',
                color: area.color,
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {skill.name}
              <button
                onClick={() => onDeleteSkill(skill.id)}
                style={{ fontSize: 14, color: area.color, opacity: 0.6 }}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
        <form onSubmit={handleAddSkill} style={{ display: 'flex', gap: 8 }}>
          <input
            value={newSkillName}
            onChange={e => setNewSkillName(e.target.value)}
            placeholder="New skill name"
            style={{ fontSize: 13, flex: 1 }}
          />
          <button
            type="submit"
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              background: area.color,
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Add Skill
          </button>
        </form>
      </div>

      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
          Tasks
        </h3>
        <AddTaskForm
          areas={[area]}
          defaultStatus="backlog"
          onAdd={handleCreateTask}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tasks.map(task => (
          <TaskCard
            key={task.id}
            {...task}
            onToggleComplete={handleToggle}
            onDelete={handleDelete}
          />
        ))}
        {tasks.length === 0 && (
          <p style={{ color: 'var(--text-muted)' }}>No tasks in this area yet.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update App.tsx to render AreaDetailView**

Add import and update `renderView`:

```tsx
import { AreaDetailView } from './pages/AreaDetailView';

// Inside renderView(), replace the default case:
default: {
  if (currentView.startsWith('area-')) {
    const areaId = currentView.replace('area-', '');
    const area = areas.find(a => a.id === areaId);
    if (!area) return <div style={{ color: 'var(--text-muted)' }}>Area not found</div>;
    const areaProgressData = progress.areas.find(a => a.area_id === areaId);
    return (
      <AreaDetailView
        area={area}
        areaProgress={areaProgressData}
        onCreateSkill={createSkill}
        onDeleteSkill={deleteSkill}
        onProgressChange={refreshAll}
      />
    );
  }
  return null;
}
```

Also destructure `createSkill` and `deleteSkill` from `useAreas()`:
```tsx
const { areas, createArea, createSkill, deleteSkill } = useAreas();
```

- [ ] **Step 3: Verify area detail view**

Open `http://localhost:3000`, create an area in the sidebar, click on it:
- Should see area name with color dot
- Can add skills via the form
- Can add tasks via AddTaskForm
- Tasks show with area badge

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: Area detail view with skill management

- AreaDetailView shows area progress, skills, and tasks
- Inline skill creation and deletion
- Task creation scoped to the area
- Progress bar with area color"
```

---

### Task 10: Polish, Animations & Final Docker Verification

**Files:**
- Modify: `frontend/src/components/ProgressBar.tsx` (add pulse animation)
- Modify: `frontend/src/styles/global.css` (scrollbar styling, transitions)
- Modify: `docker-compose.yml` (verify volumes and build contexts)
- Modify: `backend/Dockerfile` (fix shared copy path)
- Modify: `frontend/Dockerfile` (fix shared copy path)

**Interfaces:**
- Consumes: all prior components
- Produces: polished, fully working Dockerized application

- [ ] **Step 1: Add pulse animation to ProgressBar**

Update `frontend/src/components/ProgressBar.tsx` — replace the `motion.div` style:

```tsx
// Replace the motion.div in ProgressBar with:
<motion.div
  initial={{ width: 0 }}
  animate={{ width: `${clampedValue}%` }}
  transition={{ duration: 0.6, ease: 'easeOut' }}
  style={{
    height: '100%',
    background: `linear-gradient(90deg, ${color}, ${color}dd)`,
    borderRadius: 4,
    boxShadow: `0 0 10px ${color}80, 0 0 20px ${color}40`,
    position: 'relative',
    overflow: 'hidden',
  }}
>
  <motion.div
    animate={{ x: ['-100%', '100%'] }}
    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
    }}
  />
</motion.div>
```

- [ ] **Step 2: Add scrollbar and transition polish to global CSS**

Append to `frontend/src/styles/global.css`:

```css
/* Scrollbar */
::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: var(--bg-primary);
}

::-webkit-scrollbar-thumb {
  background: var(--bg-tertiary);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--border);
}

/* Smooth transitions */
button:hover {
  opacity: 0.85;
}

a {
  color: var(--accent);
  text-decoration: none;
}
```

- [ ] **Step 3: Fix Dockerfiles for correct shared path**

```dockerfile
# backend/Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY backend/package.json ./
RUN npm install

COPY backend/tsconfig.json ./
COPY backend/src/ ./src/
COPY shared/ ./shared/

EXPOSE 4000

CMD ["npm", "run", "dev"]
```

```dockerfile
# frontend/Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY frontend/package.json ./
RUN npm install

COPY frontend/tsconfig.json ./
COPY frontend/vite.config.ts ./
COPY frontend/index.html ./
COPY frontend/src/ ./src/
COPY shared/ /shared/

EXPOSE 3000

CMD ["npm", "run", "dev"]
```

- [ ] **Step 4: Full stack verification**

```bash
docker-compose down -v
docker-compose up --build -d
```

Wait for all services to be healthy, then:

1. `curl http://localhost:4000/api/health` → `{"status":"ok"}`
2. Open `http://localhost:3000` in browser
3. Create an area "Communication" with purple color
4. Click area, add skill "Speaking"
5. Add task "Explain a topic aloud for 5 min" to backlog
6. Navigate to Backlog, drag task up
7. Navigate to Today, verify task appears, check it off
8. Verify progress bars update and glow

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: UI polish and Docker verification

- Pulse animation on progress bars
- Custom scrollbar styling
- Fixed Dockerfile build contexts for shared types
- Full stack verified working end-to-end"
```

---

## Self-Review

**Spec coverage check:**
- Areas CRUD: Task 2 ✓
- Skills CRUD: Task 2 ✓
- Tasks CRUD: Task 3 ✓
- Completions: Task 3 ✓
- Progress endpoints: Task 4 ✓
- Dark theme with glowing bars: Task 6, 10 ✓
- Today view with checkboxes: Task 7 ✓
- Week view with drag-and-drop: Task 8 ✓
- Backlog with freeform queue: Task 8 ✓
- Area detail: Task 9 ✓
- Docker Compose full stack: Task 1, 10 ✓
- Shared TypeScript types: Task 1 ✓

**Placeholder scan:** No TBDs, TODOs, or vague instructions found.

**Type consistency:** All interfaces use consistent naming — `TaskStatus`, `ProgressStats`, `AreaProgress` match across shared types, backend responses, and frontend hooks.
