import { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import { UUID_RE } from '../../gym/validate';

export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export const notFound = (res: Response) => res.status(404).json({ error: 'not found' });

export function requireUuidParams(router: Router, ...names: string[]) {
  for (const name of names) {
    router.param(name, (_req, res, next, value) => (UUID_RE.test(String(value)) ? next() : notFound(res)));
  }
}

export const toNum = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
