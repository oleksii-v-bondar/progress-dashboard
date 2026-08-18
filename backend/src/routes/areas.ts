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
