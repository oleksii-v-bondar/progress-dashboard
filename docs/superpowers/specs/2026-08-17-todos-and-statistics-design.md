# Todos & Enhanced Statistics — Design Spec

**Date:** 2026-08-17  
**Status:** Approved

---

## Overview

Add simple todo items (no skill/area) with their own visual color, include them in statistics alongside learning tasks, and add all-time + split week-by-week statistics to the History view.

---

## Database

New table `todos` — completely independent from `tasks`:

```sql
CREATE TABLE todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

- No foreign keys, no status enum.
- `completed = true` means done and hidden (auto-hide behavior, no undo).
- Live DB migration: `ALTER TABLE` to add the table (no changes to existing tables).

---

## Backend

### New routes: `/api/todos`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/todos` | Returns all incomplete todos ordered by `position` |
| POST | `/api/todos` | Create todo `{ title }` |
| PUT | `/api/todos/:id` | Update title |
| DELETE | `/api/todos/:id` | Delete todo |
| POST | `/api/todos/:id/complete` | Mark done (`completed = true`); todo disappears from list |
| PATCH | `/api/todos/reorder` | Update positions `{ todoIds: string[] }` — route must come before `/:id` |

No uncomplete endpoint — completed todos are gone. Delete is the escape hatch.

### Updated progress endpoints

**`/progress/today`**
- Add count of todos completed today (`completed = true AND completed_at::date = today`)
- Response adds `todos_completed` field; `completed` becomes `learning_completed`
- Or simpler: keep `completed` as the sum, add `todos` and `learning` as breakdown fields.

Chosen shape:
```json
{ "completed": 5, "total": 7, "learning": 3, "todos": 2 }
```

**`/progress/week`** — same breakdown added.

**`/progress/history`**
- Each week entry gains `learning` and `todos` counts.
- Each daily entry gains `learning` and `todos` counts.
- `completed` remains the sum for backwards compatibility.

### New endpoint: `/progress/alltime`

```json
{
  "total_completions": 42,
  "learning_completions": 30,
  "todo_completions": 12,
  "tasks_created": 18,
  "todos_created": 24,
  "current_streak": 3,
  "longest_streak": 7
}
```

Streak = consecutive calendar days (ending today) with at least 1 completion from either table. Computed in SQL using a gaps-and-islands approach on the `completions` table plus a `todo_completed_at` date recorded on the `todos` table.

> **Note:** `todos` table needs a `completed_at DATE` column to record when it was completed (needed for today/week/history queries).

Revised todos table:
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

---

## Frontend

### New: `TodosView` page

- Sidebar entry: "Todos" between Backlog and Archived.
- Add input at top (text field + Enter to submit).
- List of incomplete todos below, ordered by `position`.
- Each todo card:
  - Cyan (`#06b6d4`) checkbox — checking auto-removes the item (optimistic removal + API call).
  - Double-click title to inline-edit.
  - Delete button.
  - Drag handle for reorder (same `@hello-pangea/dnd` pattern as tasks).
- Empty state: "No todos. Add something above."

### New: `useTodos` hook

Mirrors `useTasks` pattern: `todos`, `createTodo`, `updateTodo`, `deleteTodo`, `completeTodo`, `reorder`, `loading`.

### Updated: `ProgressOverview` (top bar)

Today and Week bars become segmented:
- Left segment: purple (`var(--accent)`) — learning completions.
- Right segment: cyan (`#06b6d4`) — todo completions.
- Label: `3 + 2 / 7` or `5/7` — show total count, with a small color legend below.
- Chosen: keep label as `completed/total`, add two colored dots as legend underneath each bar.

### Updated: `HistoryView`

**All-Time section** (new, at top):
- Stat cards in a row: Total completions, Current streak (with flame or similar), Longest streak, Tasks created, Todos created.

**This Week daily bars** — stacked two-color bars (cyan on top of purple).

**Weekly Summary bars** — same stacked pattern.

---

## Shared Types

Add to `shared/types.ts`:

```ts
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

Update `ProgressStats`:
```ts
export interface ProgressStats {
  completed: number;
  total: number;
  learning: number;
  todos: number;
}
```

---

## Implementation Order

1. DB migration (add `todos` table to `init.sql` + run `CREATE TABLE` on live DB)
2. Backend: `todos` routes
3. Backend: update progress endpoints + add `/alltime`
4. Shared types update
5. Frontend: `useTodos` hook + API client additions
6. Frontend: `TodosView` page + sidebar entry
7. Frontend: `ProgressOverview` split bars
8. Frontend: `HistoryView` all-time stats + split history bars

---

## Out of Scope

- Backlog/week/today pipeline for todos (flat list only)
- Undo complete for todos
- Todo categories or tags
