import { Router } from 'express';
import { loadBorders } from '../services/bordersStore.js';

const router = Router();

router.get('/', async (_req, res) => {
  const borders = await loadBorders();
  res.json(borders);
});

export default router;
