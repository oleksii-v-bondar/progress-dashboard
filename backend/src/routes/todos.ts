import { Router } from 'express';
import db from '../db/knex';

const router = Router();

router.get('/', async (req, res) => {
  const showCompleted = req.query.completed === 'true';
  const todos = await db('todos')
    .where({ completed: showCompleted })
    .orderBy(showCompleted ? 'completed_at' : 'position', showCompleted ? 'desc' : 'asc');
  res.json(todos);
});

router.post('/', async (req, res) => {
  const { title } = req.body as { title: string };
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
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
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
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
