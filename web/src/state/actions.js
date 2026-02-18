import { simulateTurn, createInitialRelations, createInitialSimState, createInitialRelationEffects } from './store.js';
import { edgeKey, hydrateRelations } from './relationships.js';
import { clampActionUsage, clampInfluence, clampPolicy, normalizeDynamicState } from './policies.js';
import { hydrateRelationEffectsState } from './relationEffects.js';
import { ACTION_DEFINITIONS, checkActionPreconditions } from './diplomaticActions.js';
import { createHistoryStore, hydrateHistoryStore, recordHistoryTurn } from '../sim/historyStore.js';

function toObject(value, fallback = {}) {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function toFiniteNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toInteger(value, fallback) {
  return Math.round(toFiniteNumber(value, fallback));
}

function isKnownCountry(countryIndex, cca3) {
  return typeof cca3 === 'string' && Object.prototype.hasOwnProperty.call(countryIndex, cca3);
}

function normalizeCountrySparseMap(raw, countryIndex, mapValue) {
  const source = toObject(raw);
  const entries = Object.entries(source)
    .filter(([cca3]) => isKnownCountry(countryIndex, cca3))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cca3, value]) => [cca3, mapValue(value)]);
  return Object.fromEntries(entries);
}

function normalizeEffectsList(rawList, normalizeItem) {
  if (!Array.isArray(rawList)) return [];
  const list = rawList
    .map((item) => normalizeItem(toObject(item, null)))
    .filter(Boolean);
  return list;
}

function normalizeRelationEffects(rawRelationEffects) {
  const source = toObject(rawRelationEffects);

  const guaranteesByEdge = Object.fromEntries(
    Object.entries(toObject(source.guaranteesByEdge))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, guarantees]) => [key, normalizeEffectsList(guarantees, (item) => {
        if (!item?.actor || !item?.target) return null;
        return {
          actor: item.actor,
          target: item.target,
          expiryTurn: Math.max(0, toInteger(item.expiryTurn, 0))
        };
      })])
      .filter(([, guarantees]) => guarantees.length)
  );

  const sanctionsByEdge = Object.fromEntries(
    Object.entries(toObject(source.sanctionsByEdge))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, sanctions]) => [key, normalizeEffectsList(sanctions, (item) => {
        if (!item?.actor || !item?.target) return null;
        return {
          actor: item.actor,
          target: item.target,
          expiryTurn: Math.max(0, toInteger(item.expiryTurn, 0)),
          growthPenaltyActor: toFiniteNumber(item.growthPenaltyActor, 0),
          growthPenaltyTarget: toFiniteNumber(item.growthPenaltyTarget, 0)
        };
      })])
      .filter(([, sanctions]) => sanctions.length)
  );

  const tradeByEdge = Object.fromEntries(
    Object.entries(toObject(source.tradeByEdge))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, trade]) => {
        const next = {};
        if (Number.isFinite(Number(trade?.level))) next.level = Math.max(0, toInteger(trade.level, 0));
        if (Number.isFinite(Number(trade?.buffExpiryTurn))) next.buffExpiryTurn = Math.max(0, toInteger(trade.buffExpiryTurn, 0));
        return [key, next];
      })
      .filter(([, trade]) => Object.keys(trade).length)
  );

  return { guaranteesByEdge, sanctionsByEdge, tradeByEdge };
}

function mergeCountryDynamicState(baseDynamic, countryInfluence, countryPolicy, countryActionState) {
  const merged = {};
  for (const [cca3, entry] of Object.entries(baseDynamic)) {
    const actionState = clampActionUsage(countryActionState?.[cca3] ?? entry);
    merged[cca3] = {
      ...entry,
      influence: clampInfluence(countryInfluence?.[cca3] ?? entry.influence),
      policy: clampPolicy(countryPolicy?.[cca3] ?? entry.policy),
      actionUsedTurn: actionState.actionUsedTurn,
      cooldowns: actionState.cooldowns
    };
  }
  return merged;
}

function normalizeRelationEdgeExtras(raw, validEdges) {
  const source = toObject(raw);
  const sparse = {};
  const validSet = new Set(validEdges.map(([a, b]) => edgeKey(a, b)));
  for (const [key, extras] of Object.entries(source).sort(([a], [b]) => a.localeCompare(b))) {
    if (!validSet.has(key)) continue;
    if (extras == null || typeof extras !== 'object' || Array.isArray(extras)) continue;
    if (!Object.keys(extras).length) continue;
    sparse[key] = { ...extras };
  }
  return sparse;
}

function mergeLegacyRelationEdgeExtras(rawRelationEdges = [], rawEdgeExtras = {}) {
  const merged = { ...toObject(rawEdgeExtras) };
  for (const row of rawRelationEdges) {
    if (!Array.isArray(row) || row.length < 7) continue;
    const [a, b, , , , , extras] = row;
    if (!a || !b || extras == null || typeof extras !== 'object' || Array.isArray(extras) || !Object.keys(extras).length) continue;
    merged[edgeKey(a, b)] = extras;
  }
  return merged;
}

function parseSnapshot(snapshot, baseState) {
  const safeSnapshot = toObject(snapshot, null);
  if (!safeSnapshot) return null;

  const rawRelationEdges = Array.isArray(safeSnapshot.relationsEdges)
    ? safeSnapshot.relationsEdges
    : Array.isArray(safeSnapshot.relationEdges) ? safeSnapshot.relationEdges : [];
  const hydrated = hydrateRelations(baseState.neighbours, rawRelationEdges);

  const dynamicBase = normalizeDynamicState(safeSnapshot.dynamic, baseState.countryIndex);
  const countryInfluence = normalizeCountrySparseMap(
    safeSnapshot.countryInfluence ?? safeSnapshot.influenceByCountry,
    baseState.countryIndex,
    (value) => clampInfluence(value)
  );
  const countryPolicy = normalizeCountrySparseMap(
    safeSnapshot.countryPolicy ?? safeSnapshot.policyByCountry,
    baseState.countryIndex,
    (value) => clampPolicy(toObject(value))
  );
  const countryActionState = normalizeCountrySparseMap(
    safeSnapshot.countryActionState ?? safeSnapshot.actionUsageByCountry,
    baseState.countryIndex,
    (value) => clampActionUsage(toObject(value))
  );

  const mergedEffects = {
    ...toObject(safeSnapshot.pacts),
    ...toObject(safeSnapshot.relationEffects)
  };
  const relationEffects = hydrateRelationEffectsState(normalizeRelationEffects(mergedEffects));

  const relationEdgeExtras = normalizeRelationEdgeExtras(
    mergeLegacyRelationEdgeExtras(rawRelationEdges, safeSnapshot.relationEdgeExtras),
    hydrated.edges
  );

  return {
    seed: safeSnapshot.seed ?? baseState.seed,
    turn: Math.max(0, toInteger(safeSnapshot.turn, baseState.turn)),
    paused: typeof safeSnapshot.paused === 'boolean' ? safeSnapshot.paused : baseState.paused,
    speed: toFiniteNumber(safeSnapshot.speed, baseState.speed),
    camera: toObject(safeSnapshot.camera, baseState.camera),
    selected: typeof safeSnapshot.selected === 'string' ? safeSnapshot.selected : baseState.selected,
    overlay: safeSnapshot.overlay ?? baseState.overlay,
    metric: safeSnapshot.metric ?? baseState.metric,
    events: Array.isArray(safeSnapshot.events) ? safeSnapshot.events : [],
    dynamic: mergeCountryDynamicState(dynamicBase, countryInfluence, countryPolicy, countryActionState),
    relations: hydrated.relations,
    relationEdges: hydrated.edges,
    postureByCountry: toObject(safeSnapshot.postureByCountry),
    relationEffects,
    relationEdgeExtras,
    queuedPlayerAction: toObject(safeSnapshot.queuedPlayerAction, null),
    chartsWindow: {
      ...baseState.chartsWindow,
      ...toObject(safeSnapshot.chartsWindow)
    },
    chartControls: {
      ...baseState.chartControls,
      ...toObject(safeSnapshot.chartControls)
    },
    chartPinned: Array.isArray(safeSnapshot.chartPinned)
      ? safeSnapshot.chartPinned.filter((code) => isKnownCountry(baseState.countryIndex, code))
      : baseState.chartPinned,
    history: hydrateHistoryStore(safeSnapshot.history, Object.keys(baseState.countryIndex))
  };
}

export function createActions(store) {
  return {
    stepTurn() {
      store.setState((s) => {
        const next = simulateTurn(s);
        recordHistoryTurn(next.history, next);
        return next;
      });
    },
    togglePause() {
      store.setState((s) => ({ ...s, paused: !s.paused }));
    },
    setSpeed(speed) {
      store.setState((s) => ({ ...s, speed }));
    },
    setHover(cca3) {
      store.setState((s) => (s.hovered === cca3 ? s : { ...s, hovered: cca3 }));
    },
    selectCountry(cca3) {
      store.setState((s) => ({ ...s, selected: cca3, dossierOpen: true }));
    },
    setOverlay(overlay) {
      store.setState((s) => ({ ...s, overlay }));
    },
    setMetric(metric) {
      store.setState((s) => ({ ...s, metric }));
    },
    setCamera(camera) {
      store.setState((s) => ({ ...s, camera }));
    },
    toggleDebug() {
      store.setState((s) => ({ ...s, debug: !s.debug }));
    },
    setSearch(value) {
      store.setState((s) => ({ ...s, search: value }));
    },
    newGame(seed) {
      store.setState((s) => {
        const { relations, edges } = createInitialRelations(seed, s.neighbours, s.countryIndex);
        const history = createHistoryStore(Object.keys(s.countryIndex));
        const next = {
          ...s,
          seed,
          turn: 0,
          events: [],
          dynamic: createInitialSimState(s.countryIndex),
          relations,
          relationEdges: edges,
          postureByCountry: {},
          relationEffects: createInitialRelationEffects(),
          queuedPlayerAction: null,
          chartPinned: [],
          history
        };
        recordHistoryTurn(history, next);
        return {
          ...next
        };
      });
    },
    setPolicyField(field, value, cca3 = null) {
      store.setState((s) => {
        const actor = cca3 ?? s.selected;
        if (!actor || !s.dynamic?.[actor]) return s;
        if (!['milTargetPct', 'growthFocus', 'stabilityFocus', 'stance'].includes(field)) return s;
        const entry = s.dynamic[actor];
        const nextPolicy = clampPolicy({
          ...(entry.policy ?? {}),
          [field]: value
        });
        return {
          ...s,
          dynamic: {
            ...s.dynamic,
            [actor]: {
              ...entry,
              policy: nextPolicy
            }
          }
        };
      });
    },
    queuePlayerDiplomaticAction(type, target, actor = null) {
      store.setState((s) => {
        const actionActor = actor ?? s.selected;
        if (!actionActor || !target || !ACTION_DEFINITIONS[type]) return s;
        const action = { actor: actionActor, target, type, source: 'player' };
        const check = checkActionPreconditions(s, action);
        if (!check.ok) return s;
        return { ...s, queuedPlayerAction: action };
      });
    },
    clearQueuedPlayerDiplomaticAction() {
      store.setState((s) => (s.queuedPlayerAction ? { ...s, queuedPlayerAction: null } : s));
    },
    setChartsWindow(partial) {
      store.setState((s) => ({ ...s, chartsWindow: { ...s.chartsWindow, ...partial } }));
    },
    setChartControls(partial) {
      store.setState((s) => ({ ...s, chartControls: { ...s.chartControls, ...partial } }));
    },
    pinCountry(cca3) {
      store.setState((s) => {
        if (!isKnownCountry(s.countryIndex, cca3) || s.chartPinned.includes(cca3)) return s;
        return { ...s, chartPinned: [...s.chartPinned, cca3] };
      });
    },
    unpinCountry(cca3) {
      store.setState((s) => ({ ...s, chartPinned: s.chartPinned.filter((code) => code !== cca3) }));
    },
    toggleChartsWindow() {
      store.setState((s) => ({ ...s, chartsWindow: { ...s.chartsWindow, open: !s.chartsWindow.open } }));
    },
    loadState(snapshot) {
      store.setState((s) => {
        const parsed = parseSnapshot(snapshot, s);
        if (!parsed) return s;
        const nextState = {
          ...s,
          seed: parsed.seed,
          turn: parsed.turn,
          paused: parsed.paused,
          speed: parsed.speed,
          camera: parsed.camera,
          selected: parsed.selected,
          overlay: parsed.overlay,
          metric: parsed.metric,
          events: parsed.events,
          dynamic: parsed.dynamic,
          relations: parsed.relations,
          relationEdges: parsed.relationEdges,
          postureByCountry: parsed.postureByCountry,
          relationEffects: parsed.relationEffects,
          relationEdgeExtras: parsed.relationEdgeExtras,
          queuedPlayerAction: parsed.queuedPlayerAction,
          chartsWindow: parsed.chartsWindow,
          chartControls: parsed.chartControls,
          chartPinned: parsed.chartPinned,
          history: parsed.history
        };
        if (!nextState.history?.size) recordHistoryTurn(nextState.history, nextState);
        return nextState;
      });
    }
  };
}
