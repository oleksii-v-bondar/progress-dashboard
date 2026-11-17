import { ErrorRequestHandler, Router } from 'express';
import plansRouter from './plans';
import sessionsRouter from './sessions';

const router = Router();
router.use(plansRouter);
router.use(sessionsRouter);

const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error('[gym]', err);
  res.status(500).json({ error: 'internal error' });
};
router.use(onError);

export default router;
