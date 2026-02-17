import fs from 'node:fs/promises';
import { paths } from './cachePaths.js';
import { logger } from './logger.js';

export async function loadOverrides() {
  try {
    const raw = await fs.readFile(paths.overrides, 'utf8');
    return JSON.parse(raw);
  } catch {
    logger.warn('No codeOverrides.json found, using empty overrides.');
    return {};
  }
}

export function resolveCode(code, overrides) {
  return overrides[code] ?? code;
}
