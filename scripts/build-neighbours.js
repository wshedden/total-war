import fs from 'node:fs/promises';
import { neighbors } from 'topojson-client';
import { paths } from '../server/src/services/cachePaths.js';
import { logger } from '../server/src/services/logger.js';

function normaliseCode(value) {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return code.length ? code : null;
}

function createNeighboursFromTopology(topo) {
  const geoms = topo?.objects?.countries?.geometries ?? [];
  const rawAdj = neighbors(geoms);
  const byCode = new Map();

  geoms.forEach((geom, idx) => {
    const props = geom.properties ?? {};
    const code = normaliseCode(props.cca3 || props.ISO_A3 || props.ADM0_A3);
    if (!code) return;
    if (!byCode.has(code)) byCode.set(code, new Set());

    for (const nIdx of rawAdj[idx] ?? []) {
      const nProps = geoms[nIdx]?.properties ?? {};
      const neighbourCode = normaliseCode(nProps.cca3 || nProps.ISO_A3 || nProps.ADM0_A3);
      if (!neighbourCode || neighbourCode === code) continue;
      byCode.get(code).add(neighbourCode);
    }
  });

  const mismatch = [];
  const codes = [...byCode.keys()].sort();
  for (const code of codes) {
    const set = byCode.get(code);
    for (const other of set) {
      if (!byCode.has(other)) byCode.set(other, new Set());
      if (!byCode.get(other).has(code)) {
        mismatch.push([code, other]);
        byCode.get(other).add(code);
      }
    }
  }

  const neighbours = {};
  for (const code of [...byCode.keys()].sort()) {
    neighbours[code] = [...byCode.get(code)].sort();
  }

  return { neighbours, mismatchCount: mismatch.length };
}

export async function buildNeighbours() {
  const topoRaw = await fs.readFile(paths.borders, 'utf8');
  const topo = JSON.parse(topoRaw);
  const { neighbours, mismatchCount } = createNeighboursFromTopology(topo);

  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'data/cache/borders.topo.json',
      version: 1,
      mismatchFixups: mismatchCount
    },
    neighbours
  };

  await fs.writeFile(paths.neighbours, JSON.stringify(payload, null, 2));
  logger.info(`Neighbours built: ${Object.keys(neighbours).length} countries, ${mismatchCount} symmetry fixups.`);
  return payload;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildNeighbours();
}
