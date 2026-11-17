import { Router } from 'express';
import db from '../../db/knex';
import { computeTrend, suggestNextWeight } from '../../gym/logic';
import { UUID_RE, validateSetBody } from '../../gym/validate';
import { findLiveDay, findLiveExercise } from './plans';
import { ah, notFound, requireUuidParams, toNum } from './util';

const router = Router();
requireUuidParams(router, 'id', 'setId', 'exId');

const sessionRows = () =>
  db('gym_sessions as s')
    .join('gym_plan_days as d', 'd.id', 's.plan_day_id')
    .select(
      's.id', 's.plan_day_id', 's.started_at', 's.finished_at', 'd.name as day_name',
      db.raw('(select count(*)::int from gym_set_logs l where l.session_id = s.id) as set_count'),
    );

router.post('/sessions', ah(async (req, res) => {
  const dayId = req.body?.plan_day_id;
  if (typeof dayId !== 'string' || !UUID_RE.test(dayId)) return res.status(400).json({ error: 'plan_day_id must be a uuid' });
  if (!(await findLiveDay(dayId))) return notFound(res);
  const existing = await db('gym_sessions').where({ plan_day_id: dayId }).whereNull('finished_at')
    .orderBy('started_at', 'desc').first('id', 'started_at');
  if (existing) return res.json(existing);
  const [created] = await db('gym_sessions').insert({ plan_day_id: dayId }).returning(['id', 'started_at']);
  res.status(201).json(created);
}));

router.get('/sessions', ah(async (_req, res) => {
  res.json(await sessionRows().whereNotNull('s.finished_at').orderBy('s.finished_at', 'desc'));
}));

// IMPORTANT: /sessions/active must be registered before /sessions/:id.
router.get('/sessions/active', ah(async (_req, res) => {
  res.json(await sessionRows().whereNull('s.finished_at').orderBy('s.started_at', 'desc'));
}));

router.get('/sessions/:id', ah(async (req, res) => {
  const session = await sessionRows().where('s.id', req.params.id).first();
  if (!session) return notFound(res);
  const sets = await db('gym_set_logs as l')
    .join('gym_day_exercises as e', 'e.id', 'l.day_exercise_id')
    .where('l.session_id', req.params.id)
    .orderBy(['e.order_index', 'l.set_number', 'l.created_at'])
    .select('l.id', 'l.day_exercise_id', 'e.exercise_name', 'l.set_number', 'l.weight_used', 'l.reps_done',
      'l.effort', 'l.extra_segments', 'l.created_at');
  const { set_count, ...rest } = session;
  res.json({ ...rest, sets: sets.map((s: any) => ({ ...s, weight_used: Number(s.weight_used) })) });
}));

router.delete('/sessions/:id', ah(async (req, res) => {
  const n = await db('gym_sessions').where({ id: req.params.id }).del();
  return n ? res.json({ success: true }) : notFound(res);
}));

router.post('/sessions/:id/sets', ah(async (req, res) => {
  const session = await db('gym_sessions').where({ id: req.params.id }).first();
  if (!session) return notFound(res);
  const { errors, set } = validateSetBody(req.body, true);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  const belongs = await db('gym_day_exercises').where({ id: set.day_exercise_id, plan_day_id: session.plan_day_id }).first('id');
  if (!belongs) return res.status(400).json({ error: 'day_exercise_id does not belong to this session' });
  const [{ id }] = await db('gym_set_logs')
    .insert({ ...set, session_id: req.params.id, extra_segments: JSON.stringify(set.extra_segments) })
    .returning('id');
  res.status(201).json({ id });
}));

router.patch('/sessions/:id/sets/:setId', ah(async (req, res) => {
  const { errors, set } = validateSetBody(req.body, false);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  const [row] = await db('gym_set_logs')
    .where({ id: req.params.setId, session_id: req.params.id })
    .update({
      weight_used: set.weight_used,
      reps_done: set.reps_done,
      effort: set.effort,
      extra_segments: JSON.stringify(set.extra_segments),
    })
    .returning('id');
  return row ? res.json({ id: row.id }) : notFound(res);
}));

router.post('/sessions/:id/finish', ah(async (req, res) => {
  const [row] = await db('gym_sessions')
    .where({ id: req.params.id })
    .update({ finished_at: db.raw('coalesce(finished_at, now())') })
    .returning(['id', 'finished_at']);
  return row ? res.json(row) : notFound(res);
}));

router.get('/exercises/:exId/suggestion', ah(async (req, res) => {
  const ex = await findLiveExercise(req.params.exId);
  if (!ex) return notFound(res);
  const last = await db('gym_set_logs as l')
    .join('gym_sessions as s', 's.id', 'l.session_id')
    .where('l.day_exercise_id', ex.id)
    .whereNotNull('s.finished_at')
    .orderBy([{ column: 's.finished_at', order: 'desc' }, { column: 's.id', order: 'desc' }])
    .first('s.id');
  const sets = last
    ? await db('gym_set_logs').where({ session_id: last.id, day_exercise_id: ex.id }).select('weight_used', 'reps_done', 'effort')
    : [];
  res.json(suggestNextWeight({
    lastSets: sets.map((s: any) => ({ ...s, weight_used: Number(s.weight_used) })),
    targetReps: ex.target_reps,
    increment: 2.5,
    startingWeight: toNum(ex.starting_weight),
  }));
}));

router.get('/exercises/:exId/trend', ah(async (req, res) => {
  const ex = await findLiveExercise(req.params.exId);
  if (!ex) return notFound(res);
  const rows = await db('gym_set_logs as l')
    .join('gym_sessions as s', 's.id', 'l.session_id')
    .where('l.day_exercise_id', ex.id)
    .whereNotNull('s.finished_at')
    .orderBy([{ column: 's.finished_at' }, { column: 's.id' }])
    .select('s.id as session_id', 's.finished_at', 'l.weight_used', 'l.reps_done');
  const sessions: Array<{ id: string; date: string; sets: Array<{ weight_used: number; reps_done: number }> }> = [];
  for (const r of rows as any[]) {
    let cur = sessions[sessions.length - 1];
    if (!cur || cur.id !== r.session_id) {
      cur = { id: r.session_id, date: new Date(r.finished_at).toISOString(), sets: [] };
      sessions.push(cur);
    }
    cur.sets.push({ weight_used: Number(r.weight_used), reps_done: r.reps_done });
  }
  res.json({ exercise_name: ex.exercise_name, ...computeTrend(sessions) });
}));

export default router;
