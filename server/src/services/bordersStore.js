import fs from 'node:fs/promises';
import { paths } from './cachePaths.js';

let borders = null;

export async function loadBorders() {
  if (borders) return borders;
  const raw = await fs.readFile(paths.borders, 'utf8');
  borders = JSON.parse(raw);
  return borders;
}

export function invalidateBorders() {
  borders = null;
}
