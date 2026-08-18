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
    // Still archive even if already completed today
    await db('tasks').where({ id }).update({ status: 'archived' });
    return res.json(existing);
  }

  const [completion] = await db('completions')
    .insert({ task_id: id, completed_at: today })
    .returning('*');

  // Auto-archive the task after completion
  await db('tasks').where({ id }).update({ status: 'archived' });

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
