import { Router } from 'express';
import { loadNeighbours } from '../services/neighboursStore.js';

const router = Router();

router.get('/', async (_req, res) => {
  const data = await loadNeighbours();
  res.json(data);
});

export default router;
