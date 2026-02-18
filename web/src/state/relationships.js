import { hashString, mulberry32, pairKey } from '../util/rng.js';

const REL_MIN = -100;
const REL_MAX = 100;
const METER_MIN = 0;
const METER_MAX = 100;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toSortedEdge(a, b) {
  return a < b ? [a, b] : [b, a];
}

export function createStableEdges(neighbours = {}) {
  const edges = [];
  for (const a of Object.keys(neighbours).sort()) {
    for (const b of [...(neighbours[a] ?? [])].sort()) {
      if (a < b) edges.push([a, b]);
    }
  }
  edges.sort((x, y) => pairKey(x[0], x[1]).localeCompare(pairKey(y[0], y[1])));
  return edges;
}

export function getNeighbours(cca3, neighbours = {}) {
  return neighbours?.[cca3] ?? [];
}

export function getEdge(relations, a, b) {
  const [x, y] = toSortedEdge(a, b);
  return relations?.[x]?.[y] ?? null;
}

export function setEdge(relations, a, b, edge) {
  const [x, y] = toSortedEdge(a, b);
  if (!relations[x]) relations[x] = {};
  if (!relations[y]) relations[y] = {};
  const frozen = {
    rel: clamp(Math.round(edge.rel), REL_MIN, REL_MAX),
    tension: clamp(Math.round(edge.tension), METER_MIN, METER_MAX),
    trust: clamp(Math.round(edge.trust), METER_MIN, METER_MAX),
    lastTurnUpdated: edge.lastTurnUpdated ?? 0,
    modifiers: (edge.modifiers ?? []).map((m) => ({
      rel: Math.round(m.rel ?? 0),
      tension: Math.round(m.tension ?? 0),
      trust: Math.round(m.trust ?? 0),
      turns: Math.max(0, Math.round(m.turns ?? 0)),
      text: m.text ?? ''
    }))
  };
  relations[x][y] = frozen;
  relations[y][x] = frozen;
}

function gaussianish(rng) {
  return (rng() + rng() + rng()) / 3;
}

function withRegionBias(rel, a, b, countryIndex) {
  const same = countryIndex?.[a]?.region && countryIndex?.[a]?.region === countryIndex?.[b]?.region;
  return same ? rel + 5 : rel;
}

export function initRelations(seed, neighbours, countryIndex) {
  const relations = {};
  const edges = createStableEdges(neighbours);

  for (const [a, b] of edges) {
    const rand = mulberry32(hashString(`pair:${seed}:${pairKey(a, b)}`));
    const relNoise = Math.round((gaussianish(rand) - 0.5) * 60);
    const rel = clamp(withRegionBias(relNoise, a, b, countryIndex), -30, 30);
    const tension = 5 + Math.floor(rand() * 16);
    const trust = 40 + Math.floor(rand() * 21);
    setEdge(relations, a, b, { rel, tension, trust, lastTurnUpdated: 0, modifiers: [] });
  }

  return { relations, edges };
}

function edgeModifierTotals(edge) {
  let rel = 0;
  let tension = 0;
  let trust = 0;
  const nextModifiers = [];
  for (const mod of edge.modifiers ?? []) {
    rel += mod.rel ?? 0;
    tension += mod.tension ?? 0;
    trust += mod.trust ?? 0;
    if ((mod.turns ?? 0) > 1) nextModifiers.push({ ...mod, turns: mod.turns - 1 });
  }
  return { rel, tension, trust, nextModifiers };
}

function classifyPosture(edge) {
  if (edge.rel <= -40 || edge.tension >= 70) return 'Hostile';
  if ((edge.rel >= -20 && edge.rel <= 39) || (edge.tension >= 40 && edge.tension <= 69)) return 'Wary';
  return edge.rel >= 40 && edge.tension < 40 ? 'Friendly' : 'Wary';
}

export function stepRelations({ turn, seed, relations, edges, dynamic, events, relationInputsByCountry = {} }) {
  const nextRelations = {};
  const postureByCountry = {};
  const nextEvents = [];

  const eventsByCountry = new Map();
  for (const evt of events) {
    if (!evt?.cca3) continue;
    if (!eventsByCountry.has(evt.cca3)) eventsByCountry.set(evt.cca3, []);
    eventsByCountry.get(evt.cca3).push(evt);
  }

  for (const [a, b] of edges) {
    const prev = getEdge(relations, a, b) ?? { rel: 0, tension: 10, trust: 50, lastTurnUpdated: 0, modifiers: [] };
    const powerA = dynamic[a]?.power ?? 0;
    const powerB = dynamic[b]?.power ?? 0;
    const denom = Math.max(powerA, powerB, 1);
    const imbalance = (powerA - powerB) / denom;

    const mod = edgeModifierTotals(prev);
    let rel = prev.rel + clamp(Math.round((0 - prev.rel) * 0.02), -1, 1);
    let tension = prev.tension;
    let trust = prev.trust;

    const hostileNear = (eventsByCountry.get(a) ?? []).some((e) => e.text?.toLowerCase().includes('shock'))
      || (eventsByCountry.get(b) ?? []).some((e) => e.text?.toLowerCase().includes('shock'));

    let tensionDelta = 0
      + (rel < 0 ? 1 : -1)
      + (Math.abs(imbalance) > 0.35 ? 1 : 0)
      + (trust < 35 ? 1 : 0)
      + (tension > 80 ? 1 : 0)
      + (hostileNear ? 1 : 0);

    let relDelta = 0
      + (tension > 75 ? -1 : 0)
      + (tension < 20 && trust > 60 ? 1 : 0);

    let trustDelta = 0
      + (rel > 25 && tension < 35 ? 1 : 0)
      - (tension > 70 ? 1 : 0)
      - (rel < -35 ? 1 : 0);

    const inputA = relationInputsByCountry[a] ?? {};
    const inputB = relationInputsByCountry[b] ?? {};
    relDelta += (inputA.relDelta ?? 0) + (inputB.relDelta ?? 0);
    tensionDelta += (inputA.tensionDelta ?? 0) + (inputB.tensionDelta ?? 0);
    trustDelta += (inputA.trustDelta ?? 0) + (inputB.trustDelta ?? 0);

    const pairRand = mulberry32(hashString(`evt:${seed}:${turn}:${pairKey(a, b)}`));
    const roll = pairRand();
    let evt = null;
    if (roll < 0.0025) {
      evt = { turn, cca3: a, secondary: b, text: 'Border Incident' };
      rel -= 10;
      tension += 15;
      mod.nextModifiers.push({ rel: -1, tension: 2, trust: -1, turns: 3, text: 'Border Incident aftermath' });
    } else if (roll < 0.005) {
      evt = { turn, cca3: a, secondary: b, text: 'Trade Deal' };
      rel += 10;
      tension -= 10;
      trust += 5;
      mod.nextModifiers.push({ rel: 1, tension: -1, trust: 1, turns: 3, text: 'Trade momentum' });
    } else if (roll < 0.007) {
      evt = { turn, cca3: a, secondary: b, text: 'Sanctions' };
      rel -= 15;
      tension += 10;
      mod.nextModifiers.push({ rel: -1, tension: 1, trust: -1, turns: 2, text: 'Sanctions pressure' });
    } else if (roll < 0.009) {
      evt = { turn, cca3: a, secondary: b, text: 'Joint Exercise' };
      rel += 5;
      trust += 10;
      mod.nextModifiers.push({ rel: 1, tension: -1, trust: 1, turns: 3, text: 'Joint exercise confidence' });
    }
    if (evt) nextEvents.push(evt);

    rel += relDelta + mod.rel;
    tension += tensionDelta + mod.tension;
    trust += trustDelta + mod.trust;

    const edge = {
      rel: clamp(rel, REL_MIN, REL_MAX),
      tension: clamp(tension, METER_MIN, METER_MAX),
      trust: clamp(trust, METER_MIN, METER_MAX),
      lastTurnUpdated: turn,
      modifiers: mod.nextModifiers
    };

    setEdge(nextRelations, a, b, edge);

    const posture = classifyPosture(edge);
    if (!postureByCountry[a]) postureByCountry[a] = {};
    if (!postureByCountry[b]) postureByCountry[b] = {};
    postureByCountry[a][b] = posture;
    postureByCountry[b][a] = posture;
  }

  return { relations: nextRelations, postureByCountry, relationEvents: nextEvents };
}

export function serializeRelations(edges, relations) {
  const relationEdges = [];
  for (const [a, b] of edges) {
    const edge = getEdge(relations, a, b);
    if (!edge) continue;
    relationEdges.push([a, b, edge.rel, edge.tension, edge.trust, edge.modifiers ?? []]);
  }
  return relationEdges;
}

export function hydrateRelations(neighbours, relationEdges = []) {
  const relations = {};
  const edges = createStableEdges(neighbours);
  for (const row of relationEdges) {
    const [a, b, rel, tension, trust, modifiers = []] = row;
    if (!a || !b) continue;
    setEdge(relations, a, b, { rel, tension, trust, modifiers, lastTurnUpdated: 0 });
  }
  return { relations, edges };
}
