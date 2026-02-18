import fs from 'node:fs/promises';
import { paths } from '../server/src/services/cachePaths.js';
import { createInitialSimState, createInitialRelations, createInitialRelationEffects, simulateTurn } from '../web/src/state/store.js';
import { TURN_INFLUENCE_CONFIG } from '../web/src/state/influence.js';
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
  postureByCountry: {},
  relationEffects: createInitialRelationEffects()
};

for (let i = 0; i < 200; i += 1) {
  state = simulateTurn(state);
}

let sumGdp = 0;
let sumMil = 0;
let sumInfluence = 0;
let sumRel = 0;
let sumTension = 0;
let sumTrust = 0;
let hostileEdges = 0;

for (const [cca3, c] of Object.entries(state.dynamic)) {
  if (!Number.isFinite(c.gdp) || !Number.isFinite(c.militaryPct) || !Number.isFinite(c.influence)) {
    throw new Error(`Invariant failed: non-finite stat for ${cca3}`);
  }
  if (c.gdp < 0) throw new Error(`Invariant failed: negative GDP for ${cca3}`);
  if (c.militaryPct < 0 || c.militaryPct > 100) throw new Error(`Invariant failed: militaryPct out of bounds for ${cca3}`);
  if (c.influence < 0 || c.influence > TURN_INFLUENCE_CONFIG.maxInfluence) {
    throw new Error(`Invariant failed: influence out of bounds for ${cca3}`);
  }

  for (const [actionType, cooldown] of Object.entries(c.cooldowns ?? {})) {
    if (!Number.isFinite(cooldown) || cooldown < 0) {
      throw new Error(`Invariant failed: cooldown invalid for ${cca3}:${actionType}`);
    }
  }

  sumGdp += c.gdp;
  sumMil += c.militaryPct;
  sumInfluence += c.influence;
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
  sumTrust += edge.trust;
  if (edge.rel <= -40 || edge.tension >= 70) hostileEdges += 1;
}

const actionCounts = {};
const actionsByActorTurn = new Map();
for (const event of state.events) {
  const match = /^(AI|Player)\s+([A-Za-z]+)/.exec(event?.text ?? '');
  if (!match) continue;
  const [, , actionType] = match;
  actionCounts[actionType] = (actionCounts[actionType] ?? 0) + 1;

  const actorTurnKey = `${event.cca3}|${event.turn}`;
  const existing = actionsByActorTurn.get(actorTurnKey) ?? 0;
  actionsByActorTurn.set(actorTurnKey, existing + 1);
}

for (const [actorTurn, count] of actionsByActorTurn.entries()) {
  if (count > 1) throw new Error(`Invariant failed: more than one action in single turn for ${actorTurn}`);
}

let activeGuarantees = 0;
for (const [edge, guarantees] of Object.entries(state.relationEffects?.guaranteesByEdge ?? {})) {
  if (!Array.isArray(guarantees)) throw new Error(`Invariant failed: guarantees payload not array for ${edge}`);
  for (const guarantee of guarantees) {
    if (!Number.isFinite(guarantee?.expiryTurn) || guarantee.expiryTurn < 0) {
      throw new Error(`Invariant failed: invalid guarantee expiry for ${edge}`);
    }
    if (guarantee.expiryTurn > state.turn) activeGuarantees += 1;
  }
}

let activeSanctions = 0;
for (const [edge, sanctions] of Object.entries(state.relationEffects?.sanctionsByEdge ?? {})) {
  if (!Array.isArray(sanctions)) throw new Error(`Invariant failed: sanctions payload not array for ${edge}`);
  for (const sanction of sanctions) {
    if (!Number.isFinite(sanction?.expiryTurn) || sanction.expiryTurn < 0) {
      throw new Error(`Invariant failed: invalid sanction expiry for ${edge}`);
    }
    if (sanction.expiryTurn > state.turn) activeSanctions += 1;
  }
}

let activeTradePacts = 0;
for (const [edge, trade] of Object.entries(state.relationEffects?.tradeByEdge ?? {})) {
  const level = trade?.level ?? 0;
  if (!Number.isFinite(level) || level < 0) {
    throw new Error(`Invariant failed: invalid trade level for ${edge}`);
  }
  if (trade?.buffExpiryTurn != null && (!Number.isFinite(trade.buffExpiryTurn) || trade.buffExpiryTurn < 0)) {
    throw new Error(`Invariant failed: invalid trade buff expiry for ${edge}`);
  }
  if (level > 0 || (trade?.buffExpiryTurn ?? 0) > state.turn) activeTradePacts += 1;
}

const actionSummary = Object.entries(actionCounts)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([type, count]) => `${type}:${count}`)
  .join(',');

const checksumParts = [
  state.turn,
  Math.round(sumGdp),
  sumMil.toFixed(4),
  state.events.length,
  sumInfluence.toFixed(4),
  sumRel,
  sumTension,
  sumTrust,
  hostileEdges,
  activeGuarantees,
  activeSanctions,
  activeTradePacts,
  actionSummary
];

const checksum = checksumParts.join(':');
const EXPECTED = '200:54667778940935:147.6187:80:1848.0000:29565:1322:31061:3:0:0:198:improveRelations:7,offerTradeDeal:61,threaten:2';
if (checksum !== EXPECTED) {
  console.error('Checksum mismatch', { checksum, EXPECTED });
  process.exit(1);
}
console.log('Sim test passed', checksum);
