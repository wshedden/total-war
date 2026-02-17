import fs from 'node:fs/promises';
import { paths } from '../server/src/services/cachePaths.js';
import { createInitialSimState, simulateTurn } from '../web/src/state/store.js';

const raw = await fs.readFile(paths.countryIndex, 'utf8');
const countryIndex = JSON.parse(raw);
let state = {
  seed: 202501,
  turn: 0,
  dynamic: createInitialSimState(countryIndex),
  events: []
};

for (let i = 0; i < 200; i += 1) {
  state = simulateTurn(state);
}

let sumGdp = 0;
let sumMil = 0;
for (const c of Object.values(state.dynamic)) {
  if (!Number.isFinite(c.gdp) || !Number.isFinite(c.militaryPct)) throw new Error('Invariant failed: NaN');
  if (c.gdp < 0) throw new Error('Invariant failed: negative GDP');
  sumGdp += c.gdp;
  sumMil += c.militaryPct;
}
const checksum = `${state.turn}:${Math.round(sumGdp)}:${sumMil.toFixed(4)}:${state.events.length}`;
const EXPECTED = '200:21452410939080:550.4824:40';
if (checksum !== EXPECTED) {
  console.error('Checksum mismatch', { checksum, EXPECTED });
  process.exit(1);
}
console.log('Sim test passed', checksum);
