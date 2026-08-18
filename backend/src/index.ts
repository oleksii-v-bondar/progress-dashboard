import express from 'express';
import cors from 'cors';
import areasRouter from './routes/areas';
import skillsRouter from './routes/skills';
import tasksRouter from './routes/tasks';
import completionsRouter from './routes/completions';
import progressRouter from './routes/progress';
import notesRouter from './routes/notes';
import todosRouter from './routes/todos';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/areas', areasRouter);
app.use('/api', skillsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/tasks', completionsRouter);
app.use('/api/progress', progressRouter);
app.use('/api/notes', notesRouter);
app.use('/api/todos', todosRouter);

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

export default app;
