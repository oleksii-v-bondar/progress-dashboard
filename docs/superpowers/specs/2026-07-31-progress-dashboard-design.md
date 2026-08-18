# Progress Dashboard — Design Spec

## Overview

A personal development dashboard for tracking small, actionable self-improvement steps. Users create areas (broad domains), skills within areas, and tasks (small steps). Tasks live in a freeform queue (backlog → this week → today) and are completed via simple checkbox. Progress is visualized with glowing progress bars per day, week, and area.

## Tech Stack

- **Frontend:** React 18 + TypeScript, Vite, react-beautiful-dnd, framer-motion
- **Backend:** Node.js + Express + TypeScript, Knex (query builder + migrations)
- **Database:** PostgreSQL 16
- **Infrastructure:** Docker Compose (all services), hot-reload in dev

## Data Model

### Area
| Column     | Type         | Notes                     |
|------------|--------------|---------------------------|
| id         | UUID (PK)    | Generated                 |
| name       | VARCHAR(255) | Required                  |
| color      | VARCHAR(7)   | Hex color for UI accents  |
| created_at | TIMESTAMP    | Default now()             |

### Skill
| Column     | Type         | Notes                     |
|------------|--------------|---------------------------|
| id         | UUID (PK)    | Generated                 |
| area_id    | UUID (FK)    | References Area           |
| name       | VARCHAR(255) | Required                  |
| created_at | TIMESTAMP    | Default now()             |

### Task
| Column      | Type         | Notes                              |
|-------------|--------------|-------------------------------------|
| id          | UUID (PK)    | Generated                           |
| skill_id    | UUID (FK)    | References Skill                    |
| name        | VARCHAR(255) | Required                            |
| description | TEXT         | Optional                            |
| status      | ENUM         | 'backlog' | 'this_week' | 'today'  |
| created_at  | TIMESTAMP    | Default now()                       |

### Completion
| Column       | Type      | Notes                          |
|--------------|-----------|--------------------------------|
| id           | UUID (PK) | Generated                      |
| task_id      | UUID (FK) | References Task                |
| completed_at | DATE      | Date of completion             |

Unique constraint on (task_id, completed_at) — one completion per task per day.

## API Endpoints

### Areas
- `GET /api/areas` — list all areas with skills and task counts
- `POST /api/areas` — create area (body: name, color)
- `PUT /api/areas/:id` — update area
- `DELETE /api/areas/:id` — delete area (cascades to skills, tasks, completions)

### Skills
- `POST /api/areas/:id/skills` — create skill in area (body: name)
- `PUT /api/skills/:id` — update skill
- `DELETE /api/skills/:id` — delete skill (cascades)

### Tasks
- `GET /api/tasks` — list tasks (query params: status, area_id, skill_id)
- `POST /api/tasks` — create task (body: skill_id, name, description, status)
- `PUT /api/tasks/:id` — update task
- `PATCH /api/tasks/:id/move` — move task (body: status)
- `DELETE /api/tasks/:id` — delete task

### Completions
- `POST /api/tasks/:id/complete` — mark task done for today
- `DELETE /api/tasks/:id/complete` — uncheck today's completion

### Progress
- `GET /api/progress/today` — today's completion count and total
- `GET /api/progress/week` — this week's stats (Mon-Sun)
- `GET /api/progress/areas` — per-area completion percentage

## Frontend Architecture

### Layout
Single-page dashboard with persistent sidebar and top progress overview.

```
┌──────────┬─────────────────────────────────────┐
│          │  Progress Overview (top bar)         │
│  Sidebar │  [Today: ████░░ 4/6] [Week: ██░░]  │
│          ├─────────────────────────────────────┤
│  Areas   │                                     │
│  list    │  Main Content Area                  │
│  + add   │  (view-dependent)                   │
│          │                                     │
└──────────┴─────────────────────────────────────┘
```

### Views
- **Today** — tasks with status "today", checkboxes, daily progress bar
- **This Week** — tasks with status "this_week", drag to move to today
- **Backlog** — all backlog tasks grouped by area/skill
- **Area Detail** — area progress bar, skills list, tasks per skill

### Interactions
- Drag-and-drop to move tasks between backlog → this_week → today
- Click checkbox to complete/uncomplete a task for today
- Inline forms to create areas, skills, tasks

### Visual Design
- Dark theme: background ~#0f0f1a, cards ~#1a1a2e
- Glowing accent colors per area (used in progress bars, borders)
- Progress bars with subtle glow/pulse animation (framer-motion)
- Smooth check-off animations
- Clean typography, high contrast text on dark background

## Project Structure

```
progress-app/
├── docker-compose.yml
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── components/    # Reusable UI components
│       ├── pages/         # View components (Today, Week, Backlog, Area)
│       ├── hooks/         # Custom React hooks
│       ├── api/           # API client functions
│       └── styles/        # Global styles, theme
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── routes/        # Express route handlers
│       ├── db/
│       │   ├── migrations/
│       │   └── knex.ts    # Knex config
│       └── index.ts       # App entry point
├── shared/
│   └── types.ts           # Shared TypeScript interfaces
└── database/
    └── init.sql           # Initial schema for Docker
```

## Docker Services

| Service  | Image/Build | Port | Notes                        |
|----------|-------------|------|------------------------------|
| frontend | ./frontend  | 3000 | Vite dev server, hot-reload  |
| backend  | ./backend   | 4000 | Express, nodemon for reload  |
| db       | postgres:16 | 5432 | Named volume for persistence |

Single `docker-compose up` starts the full stack.

## Decisions & Constraints

- Simple checkbox completion (no streaks, no quantitative logging)
- Freeform queue planning (backlog → this_week → today, manual assignment)
- Progress shown as: daily completion bar, weekly completion bar, per-area bars
- No authentication (single-user personal tool)
- No external integrations in v1
