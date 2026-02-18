import fs from 'node:fs/promises';
import { paths } from './cachePaths.js';

let neighbours = null;

export async function loadNeighbours() {
  if (neighbours) return neighbours;
  const raw = await fs.readFile(paths.neighbours, 'utf8');
  neighbours = JSON.parse(raw);
  return neighbours;
}

export function invalidateNeighbours() {
  neighbours = null;
}
