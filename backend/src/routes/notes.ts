import { Router } from 'express';
import db from '../db/knex';

const router = Router();

router.get('/', async (_req, res) => {
  const notes = await db('notes').orderBy('created_at', 'desc');
  res.json(notes);
});

router.post('/', async (req, res) => {
  const { content } = req.body;
  const [note] = await db('notes').insert({ content }).returning('*');
  res.status(201).json(note);
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { content, answered } = req.body;
  const updates: Record<string, unknown> = {};
  if (content !== undefined) updates.content = content;
  if (answered !== undefined) updates.answered = answered;
  const [note] = await db('notes').where({ id }).update(updates).returning('*');
  if (!note) return res.status(404).json({ error: 'Note not found' });
  res.json(note);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  await db('notes').where({ id }).del();
  res.json({ success: true });
});

export default router;
