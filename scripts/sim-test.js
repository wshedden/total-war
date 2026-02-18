import fs from 'node:fs/promises';
import { paths } from '../server/src/services/cachePaths.js';
import { createInitialSimState, createInitialRelations, simulateTurn } from '../web/src/state/store.js';
import { getEdge } from '../web/src/state/relationships.js';

const raw = await fs.readFile(paths.countryIndex, 'utf8');
const countryIndex = JSON.parse(raw);
const neighboursRaw = await fs.readFile(paths.neighbours, 'utf8');
const neighboursPayload = JSON.parse(neighboursRaw);
const neighbours = neighboursPayload.neighbours ?? {};
const initialRelations = createInitialRelations(202501, neighbours, countryIndex);

let state = {
  seed: 202501,
  turn: 0,
  dynamic: createInitialSimState(countryIndex),
  events: [],
  countryIndex,
  neighbours,
  relations: initialRelations.relations,
  relationEdges: initialRelations.edges,
  postureByCountry: {}
};

for (let i = 0; i < 200; i += 1) {
  state = simulateTurn(state);
}

let sumGdp = 0;
let sumMil = 0;
let sumRel = 0;
let sumTension = 0;
let hostileEdges = 0;
for (const c of Object.values(state.dynamic)) {
  if (!Number.isFinite(c.gdp) || !Number.isFinite(c.militaryPct)) throw new Error('Invariant failed: NaN');
  if (c.gdp < 0) throw new Error('Invariant failed: negative GDP');
  sumGdp += c.gdp;
  sumMil += c.militaryPct;
}

for (const [a, b] of state.relationEdges) {
  const edge = getEdge(state.relations, a, b);
  const mirror = getEdge(state.relations, b, a);
  if (!edge || !mirror) throw new Error(`Missing edge ${a}-${b}`);
  if (JSON.stringify(edge) !== JSON.stringify(mirror)) throw new Error(`Asymmetry ${a}-${b}`);
  if (edge.rel < -100 || edge.rel > 100) throw new Error(`Rel out of bounds ${a}-${b}`);
  if (edge.tension < 0 || edge.tension > 100) throw new Error(`Tension out of bounds ${a}-${b}`);
  if (edge.trust < 0 || edge.trust > 100) throw new Error(`Trust out of bounds ${a}-${b}`);
  sumRel += edge.rel;
  sumTension += edge.tension;
  if (edge.rel <= -40 || edge.tension >= 70) hostileEdges += 1;
}

const checksum = `${state.turn}:${Math.round(sumGdp)}:${sumMil.toFixed(4)}:${state.events.length}:${sumRel}:${sumTension}:${hostileEdges}`;
const EXPECTED = '200:21452410939080:324.9961:80:-1685:16336:154';
if (checksum !== EXPECTED) {
  console.error('Checksum mismatch', { checksum, EXPECTED });
  process.exit(1);
}
console.log('Sim test passed', checksum);
