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
    ...taskDays.map((r: { day: Date }) => r.day.toISOString().split('T')[0]),
    ...todoDays.map((r: { day: Date }) => r.day.toISOString().split('T')[0]),
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
    const key = (r.week_start instanceof Date ? r.week_start.toISOString() : r.week_start).split('T')[0];
    weeksMap.set(key, { learning: Number(r.completed), todos: 0 });
  }
  for (const r of todoWeeks.rows) {
    const key = (r.week_start instanceof Date ? r.week_start.toISOString() : r.week_start).split('T')[0];
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
    const key = (r.day instanceof Date ? r.day.toISOString() : r.day).split('T')[0];
    dailyMap.set(key, { learning: Number(r.completed), todos: 0 });
  }
  for (const r of todoDaily.rows) {
    const key = (r.day instanceof Date ? r.day.toISOString() : r.day).split('T')[0];
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
