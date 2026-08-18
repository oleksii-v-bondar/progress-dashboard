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
