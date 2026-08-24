import { Router } from 'express';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod';
const APP_PASSWORD = process.env.APP_PASSWORD || 'admin';

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password !== APP_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  const token = jwt.sign({ authenticated: true }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token });
});

router.get('/check', (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    jwt.verify(header.slice(7), JWT_SECRET);
    res.json({ authenticated: true });
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
