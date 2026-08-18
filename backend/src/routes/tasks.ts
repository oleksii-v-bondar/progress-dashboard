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
    .orderBy('tasks.position', 'asc');

  if (status) query = query.where('tasks.status', status as string);
  if (area_id) query = query.where('areas.id', area_id as string);
  if (skill_id) query = query.where('tasks.skill_id', skill_id as string);

  const tasks = await query;

  // Check completions
  const today = new Date().toISOString().split('T')[0];
  const completions = await db('completions')
    .whereIn('task_id', tasks.map(t => t.id))
    .where('completed_at', today);

  const completedTodayIds = new Set(completions.map(c => c.task_id));

  // For archived tasks, check if they have any completion at all
  const archivedIds = tasks.filter(t => t.status === 'archived').map(t => t.id);
  let everCompletedIds = new Set<string>();
  if (archivedIds.length > 0) {
    const anyCompletions = await db('completions')
      .whereIn('task_id', archivedIds)
      .select('task_id')
      .groupBy('task_id');
    everCompletedIds = new Set(anyCompletions.map(c => c.task_id));
  }

  const tasksWithCompletion = tasks.map(task => ({
    ...task,
    completed_today: task.status === 'archived'
      ? everCompletedIds.has(task.id)
      : completedTodayIds.has(task.id),
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

router.patch('/reorder', async (req, res) => {
  const { taskIds } = req.body as { taskIds: string[] };
  await Promise.all(
    taskIds.map((id, index) => db('tasks').where({ id }).update({ position: index }))
  );
  res.json({ success: true });
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
