import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import healthRoute from './routes/health.js';
import countriesRoute from './routes/countries.js';
import bordersRoute from './routes/borders.js';
import neighboursRoute from './routes/neighbours.js';
import { paths } from './services/cachePaths.js';
import { logger } from './services/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json({ limit: '1mb' }));

app.use('/api/health', healthRoute);
app.use('/api/countries', countriesRoute);
app.use('/api/borders', bordersRoute);
app.use('/api/neighbours', neighboursRoute);

app.post('/api/data/refresh', async (_req, res) => {
  const { spawn } = await import('node:child_process');
  const cmd = spawn(process.execPath, ['scripts/data-refresh.js', '--refresh'], {
    cwd: paths.root,
    stdio: 'inherit'
  });
  cmd.on('close', (code) => {
    if (code === 0) res.json({ ok: true });
    else res.status(500).json({ ok: false, code });
  });
});

app.use(express.static(path.join(paths.root, 'web', 'public')));

app.get('*', async (_req, res) => {
  try {
    await fs.access(path.join(paths.root, 'web', 'public', 'app.js'));
  } catch {
    logger.info('app.js missing; run npm run build');
  }
  res.sendFile(path.join(paths.root, 'web', 'public', 'index.html'));
});

app.listen(port, () => logger.info(`Server listening on http://localhost:${port}`));
