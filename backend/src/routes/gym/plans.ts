import { Router } from 'express';
import { Knex } from 'knex';
import db from '../../db/knex';
import { isInt, isNonEmptyStr, PlanImport, validateExerciseFields, validatePlanImport } from '../../gym/validate';
import { ah, notFound, requireUuidParams, toNum } from './util';

const router = Router();
requireUuidParams(router, 'id', 'dayId', 'exId');

type Q = Knex | Knex.Transaction;
const EX_COLS = ['id', 'exercise_name', 'order_index', 'target_sets', 'target_reps', 'rest_seconds', 'starting_weight', 'extra_segments'];

const livePlan = (id: string, q: Q = db) => q('gym_plans').where({ id }).whereNull('deleted_at').first();

export function findLiveDay(id: string, q: Q = db) {
  return q('gym_plan_days as d')
    .join('gym_plans as p', 'p.id', 'd.plan_id')
    .where('d.id', id)
    .whereNull('p.deleted_at')
    .first('d.id', 'd.name', 'd.is_superset', 'd.plan_id', 'd.order_index');
}

export function findLiveExercise(id: string, q: Q = db) {
  return q('gym_day_exercises as e')
    .join('gym_plan_days as d', 'd.id', 'e.plan_day_id')
    .join('gym_plans as p', 'p.id', 'd.plan_id')
    .where('e.id', id)
    .whereNull('p.deleted_at')
    .first('e.*');
}

async function loadExercises(dayIds: string[], q: Q = db) {
  if (!dayIds.length) return [];
  const rows = await q('gym_day_exercises')
    .whereIn('plan_day_id', dayIds)
    .orderBy(['order_index', 'id'])
    .select([...EX_COLS, 'plan_day_id']);
  return rows.map((e: any) => ({ ...e, starting_weight: toNum(e.starting_weight) }));
}

async function loadPlanTree(id: string, q: Q = db) {
  const plan = await livePlan(id, q);
  if (!plan) return null;
  const days = await q('gym_plan_days').where({ plan_id: id }).orderBy(['order_index', 'id'])
    .select('id', 'name', 'order_index', 'is_superset');
  const exercises = await loadExercises(days.map((d: any) => d.id), q);
  return {
    id: plan.id as string,
    name: plan.name as string,
    is_active: plan.is_active as boolean,
    days: days.map((d: any) => ({
      ...d,
      exercises: exercises.filter((e: any) => e.plan_day_id === d.id).map(({ plan_day_id, ...e }: any) => e),
    })),
  };
}

type PlanTree = NonNullable<Awaited<ReturnType<typeof loadPlanTree>>>;

function treeToImport(tree: PlanTree): PlanImport {
  return {
    name: tree.name,
    days: tree.days.map((d: any) => ({
      name: d.name,
      is_superset: d.is_superset,
      exercises: d.exercises.map((e: any) => ({
        exercise_name: e.exercise_name,
        target_sets: e.target_sets,
        target_reps: e.target_reps,
        rest_seconds: e.rest_seconds,
        starting_weight: e.starting_weight,
        extra_segments: e.extra_segments,
      })),
    })),
  };
}

async function insertPlanTree(plan: PlanImport, trx: Knex.Transaction): Promise<string> {
  const [{ id }] = await trx('gym_plans').insert({ name: plan.name }).returning('id');
  for (const [i, d] of plan.days.entries()) {
    const [{ id: dayId }] = await trx('gym_plan_days')
      .insert({ plan_id: id, name: d.name, order_index: i, is_superset: !!d.is_superset })
      .returning('id');
    if (d.exercises.length) {
      await trx('gym_day_exercises').insert(
        d.exercises.map((e, j) => ({
          plan_day_id: dayId,
          exercise_name: e.exercise_name,
          order_index: j,
          target_sets: e.target_sets,
          target_reps: e.target_reps,
          rest_seconds: e.rest_seconds ?? null,
          starting_weight: e.starting_weight ?? null,
          extra_segments: JSON.stringify(e.extra_segments ?? []),
        })),
      );
    }
  }
  return id;
}

async function nextOrder(table: string, column: string, value: string): Promise<number> {
  const row: any = await db(table).where(column, value).max('order_index as m').first();
  return row?.m == null ? 0 : Number(row.m) + 1;
}

// ---- plans ----
router.get('/plans', ah(async (_req, res) => {
  res.json(await db('gym_plans').whereNull('deleted_at').orderBy(['created_at', 'name']).select('id', 'name', 'is_active'));
}));

router.post('/plans', ah(async (req, res) => {
  if (!isNonEmptyStr(req.body?.name)) return res.status(400).json({ error: 'name must be a non-empty string' });
  const [{ id }] = await db('gym_plans').insert({ name: req.body.name.trim() }).returning('id');
  res.status(201).json({ id });
}));

// IMPORTANT: /plans/import must be registered before /plans/:id routes.
router.post('/plans/import', ah(async (req, res) => {
  const r = validatePlanImport(req.body);
  if (!r.ok) return res.status(400).json({ error: 'invalid plan', details: r.details });
  const id = await db.transaction((trx) => insertPlanTree(r.plan, trx));
  res.status(201).json({ id });
}));

router.get('/plans/:id', ah(async (req, res) => {
  const tree = await loadPlanTree(req.params.id);
  return tree ? res.json(tree) : notFound(res);
}));

router.put('/plans/:id', ah(async (req, res) => {
  const { id } = req.params;
  const { name, is_active } = req.body ?? {};
  if (name !== undefined && !isNonEmptyStr(name)) return res.status(400).json({ error: 'name must be a non-empty string' });
  if (is_active !== undefined && typeof is_active !== 'boolean') return res.status(400).json({ error: 'is_active must be a boolean' });
  if (!(await livePlan(id))) return notFound(res);
  await db.transaction(async (trx) => {
    if (is_active === true) await trx('gym_plans').whereNot({ id }).update({ is_active: false });
    const patch: Record<string, unknown> = {};
    if (name !== undefined) patch.name = name.trim();
    if (is_active !== undefined) patch.is_active = is_active;
    if (Object.keys(patch).length) await trx('gym_plans').where({ id }).update(patch);
  });
  res.json({ id });
}));

router.delete('/plans/:id', ah(async (req, res) => {
  if (!(await livePlan(req.params.id))) return notFound(res);
  await db('gym_plans').where({ id: req.params.id }).update({ deleted_at: db.fn.now(), is_active: false });
  res.json({ success: true });
}));

router.post('/plans/:id/duplicate', ah(async (req, res) => {
  const tree = await loadPlanTree(req.params.id);
  if (!tree) return notFound(res);
  const copy = { ...treeToImport(tree), name: `${tree.name} (copy)` };
  const id = await db.transaction((trx) => insertPlanTree(copy, trx));
  res.status(201).json({ id });
}));

router.get('/plans/:id/export', ah(async (req, res) => {
  const tree = await loadPlanTree(req.params.id);
  return tree ? res.json(treeToImport(tree)) : notFound(res);
}));

// ---- days ----
router.post('/plans/:id/days', ah(async (req, res) => {
  const { name, is_superset } = req.body ?? {};
  if (!isNonEmptyStr(name)) return res.status(400).json({ error: 'name must be a non-empty string' });
  if (is_superset !== undefined && typeof is_superset !== 'boolean') return res.status(400).json({ error: 'is_superset must be a boolean' });
  if (!(await livePlan(req.params.id))) return notFound(res);
  const order_index = await nextOrder('gym_plan_days', 'plan_id', req.params.id);
  const [{ id }] = await db('gym_plan_days')
    .insert({ plan_id: req.params.id, name: name.trim(), order_index, is_superset: is_superset === true })
    .returning('id');
  res.status(201).json({ id });
}));

router.get('/days/:dayId', ah(async (req, res) => {
  const day = await findLiveDay(req.params.dayId);
  if (!day) return notFound(res);
  const exercises = (await loadExercises([day.id])).map(({ plan_day_id, ...e }: any) => e);
  res.json({ id: day.id, name: day.name, is_superset: day.is_superset, plan_id: day.plan_id, exercises });
}));

router.put('/days/:dayId', ah(async (req, res) => {
  const { name, order_index, is_superset } = req.body ?? {};
  if (name !== undefined && !isNonEmptyStr(name)) return res.status(400).json({ error: 'name must be a non-empty string' });
  if (order_index !== undefined && !isInt(order_index, 0)) return res.status(400).json({ error: 'order_index must be a non-negative integer' });
  if (is_superset !== undefined && typeof is_superset !== 'boolean') return res.status(400).json({ error: 'is_superset must be a boolean' });
  if (!(await findLiveDay(req.params.dayId))) return notFound(res);
  const patch: Record<string, unknown> = {};
  if (name !== undefined) patch.name = name.trim();
  if (order_index !== undefined) patch.order_index = order_index;
  if (is_superset !== undefined) patch.is_superset = is_superset;
  if (Object.keys(patch).length) await db('gym_plan_days').where({ id: req.params.dayId }).update(patch);
  res.json({ id: req.params.dayId });
}));

router.delete('/days/:dayId', ah(async (req, res) => {
  if (!(await findLiveDay(req.params.dayId))) return notFound(res);
  await db('gym_plan_days').where({ id: req.params.dayId }).del();
  res.json({ success: true });
}));

// ---- exercises ----
router.post('/days/:dayId/exercises', ah(async (req, res) => {
  const { errors, fields } = validateExerciseFields(req.body, false);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  if (!(await findLiveDay(req.params.dayId))) return notFound(res);
  const order_index = (fields.order_index as number | undefined) ?? (await nextOrder('gym_day_exercises', 'plan_day_id', req.params.dayId));
  const [{ id }] = await db('gym_day_exercises')
    .insert({
      ...fields,
      plan_day_id: req.params.dayId,
      order_index,
      extra_segments: JSON.stringify(fields.extra_segments ?? []),
    })
    .returning('id');
  res.status(201).json({ id });
}));

router.put('/exercises/:exId', ah(async (req, res) => {
  const { errors, fields } = validateExerciseFields(req.body, true);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  if (!(await findLiveExercise(req.params.exId))) return notFound(res);
  if (fields.extra_segments !== undefined) fields.extra_segments = JSON.stringify(fields.extra_segments);
  if (Object.keys(fields).length) await db('gym_day_exercises').where({ id: req.params.exId }).update(fields);
  res.json({ id: req.params.exId });
}));

router.delete('/exercises/:exId', ah(async (req, res) => {
  if (!(await findLiveExercise(req.params.exId))) return notFound(res);
  await db('gym_day_exercises').where({ id: req.params.exId }).del();
  res.json({ success: true });
}));

export default router;
