import fs from 'node:fs/promises';
import { paths } from './cachePaths.js';

let cache = null;

export async function loadCountryIndex() {
  if (cache) return cache;
  const raw = await fs.readFile(paths.countryIndex, 'utf8');
  cache = JSON.parse(raw);
  return cache;
}

export function invalidateCountryIndex() {
  cache = null;
}

export async function getCountryList() {
  const index = await loadCountryIndex();
  return Object.values(index).map((c) => ({
    cca3: c.cca3,
    name: c.name,
    bbox: c.bbox ?? null
  }));
}

export async function getFullCountryList() {
  const index = await loadCountryIndex();
  return Object.values(index);
}

export async function getCountry(cca3) {
  const index = await loadCountryIndex();
  return index[cca3] ?? null;
}
