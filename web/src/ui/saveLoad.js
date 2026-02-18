import { serializeRelations } from '../state/relationships.js';
import { serialiseHistory } from '../sim/historyStore.js';

const KEY = 'total-war-v0-save';
const SNAPSHOT_SCHEMA_VERSION = 2;

function isNonEmptyObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

function buildCountryFieldMap(dynamic = {}, pickField) {
  const entries = Object.entries(dynamic)
    .map(([cca3, entry]) => [cca3, pickField(entry)])
    .filter(([, value]) => value != null)
    .sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}

function collectSparseEdgeExtras(edges = [], relations = {}, relationEdgeExtras = {}) {
  const sparse = {};
  for (const [a, b] of edges) {
    const edge = relations?.[a]?.[b];
    const bakedExtras = edge?.extras;
    const keyedExtras = relationEdgeExtras?.[`${a}|${b}`] ?? relationEdgeExtras?.[`${b}|${a}`];
    const extras = isNonEmptyObject(bakedExtras) ? bakedExtras : keyedExtras;
    if (!isNonEmptyObject(extras)) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    sparse[key] = extras;
  }
  return sparse;
}

export function makeSnapshot(state) {
  const countryInfluence = buildCountryFieldMap(state.dynamic, (entry) => entry?.influence ?? null);
  const countryPolicy = buildCountryFieldMap(state.dynamic, (entry) => entry?.policy ?? null);
  const countryActionState = buildCountryFieldMap(state.dynamic, (entry) => ({
    actionUsedTurn: entry?.actionUsedTurn ?? null,
    cooldowns: entry?.cooldowns ?? {}
  }));

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    seed: state.seed,
    turn: state.turn,
    paused: state.paused,
    speed: state.speed,
    camera: state.camera,
    selected: state.selected,
    overlay: state.overlay,
    metric: state.metric,
    dynamic: state.dynamic,
    countryInfluence,
    countryPolicy,
    countryActionState,
    events: state.events,
    postureByCountry: state.postureByCountry,
    relationsEdges: serializeRelations(state.relationEdges, state.relations),
    relationEffects: state.relationEffects,
    pacts: state.relationEffects,
    relationEdgeExtras: collectSparseEdgeExtras(state.relationEdges, state.relations, state.relationEdgeExtras),
    charts: state.charts,
    history: serialiseHistory(state.history)
  };
}

export function saveToLocal(snapshot) {
  localStorage.setItem(KEY, JSON.stringify(snapshot));
}

export function loadFromLocal() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function exportJson(snapshot) {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `total-war-save-${Date.now()}.json`;
  a.click();
}

export function importJsonFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const text = await file.text();
      try {
        resolve(JSON.parse(text));
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
}
