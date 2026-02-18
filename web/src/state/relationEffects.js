import { getSymmetricEdgeValue, setSymmetricEdgeValue } from './relationships.js';

const DEFAULT_STATE = Object.freeze({
  guaranteesByEdge: {},
  sanctionsByEdge: {},
  tradeByEdge: {}
});

function cloneEdgeMap(edgeMap = {}) {
  return { ...edgeMap };
}

function cloneContainer(state = {}) {
  return {
    guaranteesByEdge: cloneEdgeMap(state.guaranteesByEdge),
    sanctionsByEdge: cloneEdgeMap(state.sanctionsByEdge),
    tradeByEdge: cloneEdgeMap(state.tradeByEdge)
  };
}

export function createInitialRelationEffectsState() {
  return cloneContainer(DEFAULT_STATE);
}

export function hydrateRelationEffectsState(snapshotState = null) {
  if (!snapshotState) return createInitialRelationEffectsState();
  return {
    guaranteesByEdge: cloneEdgeMap(snapshotState.guaranteesByEdge),
    sanctionsByEdge: cloneEdgeMap(snapshotState.sanctionsByEdge),
    tradeByEdge: cloneEdgeMap(snapshotState.tradeByEdge)
  };
}

export function addGuaranteeEffect(relationEffects, actor, target, expiryTurn) {
  const list = Array.isArray(getSymmetricEdgeValue(relationEffects.guaranteesByEdge, actor, target))
    ? [...getSymmetricEdgeValue(relationEffects.guaranteesByEdge, actor, target)]
    : [];
  const deduped = list.filter((item) => !(item?.actor === actor && item?.target === target));
  deduped.push({ actor, target, expiryTurn: Math.max(0, Math.round(expiryTurn ?? 0)) });
  setSymmetricEdgeValue(relationEffects.guaranteesByEdge, actor, target, deduped);
}

export function addSanctionEffect(relationEffects, actor, target, expiryTurn, growthPenaltyActor, growthPenaltyTarget) {
  const list = Array.isArray(getSymmetricEdgeValue(relationEffects.sanctionsByEdge, actor, target))
    ? [...getSymmetricEdgeValue(relationEffects.sanctionsByEdge, actor, target)]
    : [];
  list.push({
    actor,
    target,
    expiryTurn: Math.max(0, Math.round(expiryTurn ?? 0)),
    growthPenaltyActor: growthPenaltyActor ?? 0,
    growthPenaltyTarget: growthPenaltyTarget ?? 0
  });
  setSymmetricEdgeValue(relationEffects.sanctionsByEdge, actor, target, list);
}

export function updateTradeEffect(relationEffects, a, b, update = {}) {
  const prev = getSymmetricEdgeValue(relationEffects.tradeByEdge, a, b) ?? {};
  const next = {
    ...(typeof update.level === 'number' ? { level: Math.max(0, Math.round(update.level)) } : (typeof prev.level === 'number' ? { level: prev.level } : {})),
    ...(typeof update.buffExpiryTurn === 'number'
      ? { buffExpiryTurn: Math.max(0, Math.round(update.buffExpiryTurn)) }
      : (typeof prev.buffExpiryTurn === 'number' ? { buffExpiryTurn: prev.buffExpiryTurn } : {}))
  };

  if (next.level == null && next.buffExpiryTurn == null) {
    setSymmetricEdgeValue(relationEffects.tradeByEdge, a, b, null);
    return;
  }
  setSymmetricEdgeValue(relationEffects.tradeByEdge, a, b, next);
}

export function runRelationEffectsStage(relationEffects, turn) {
  const next = cloneContainer(relationEffects);
  const growthDeltaByCountry = {};

  for (const [edge, guarantees] of Object.entries(next.guaranteesByEdge)) {
    const active = (guarantees ?? []).filter((item) => (item?.expiryTurn ?? 0) > turn);
    if (!active.length) delete next.guaranteesByEdge[edge];
    else next.guaranteesByEdge[edge] = active;
  }

  for (const [edge, sanctions] of Object.entries(next.sanctionsByEdge)) {
    const active = (sanctions ?? []).filter((item) => (item?.expiryTurn ?? 0) > turn);
    if (!active.length) {
      delete next.sanctionsByEdge[edge];
      continue;
    }
    next.sanctionsByEdge[edge] = active;

    for (const sanction of active) {
      if (sanction.actor) {
        growthDeltaByCountry[sanction.actor] = (growthDeltaByCountry[sanction.actor] ?? 0) + (sanction.growthPenaltyActor ?? 0);
      }
      if (sanction.target) {
        growthDeltaByCountry[sanction.target] = (growthDeltaByCountry[sanction.target] ?? 0) + (sanction.growthPenaltyTarget ?? 0);
      }
    }
  }

  for (const [edge, trade] of Object.entries(next.tradeByEdge)) {
    const level = typeof trade?.level === 'number' ? trade.level : null;
    const buffExpiryTurn = typeof trade?.buffExpiryTurn === 'number' ? trade.buffExpiryTurn : null;
    const hasActiveBuff = buffExpiryTurn != null && buffExpiryTurn > turn;

    if (level == null && !hasActiveBuff) {
      delete next.tradeByEdge[edge];
      continue;
    }

    next.tradeByEdge[edge] = {
      ...(level == null ? {} : { level }),
      ...(hasActiveBuff ? { buffExpiryTurn } : {})
    };

    if (!hasActiveBuff) continue;
    const [a, b] = edge.split('|');
    growthDeltaByCountry[a] = (growthDeltaByCountry[a] ?? 0) + 0.002;
    growthDeltaByCountry[b] = (growthDeltaByCountry[b] ?? 0) + 0.002;
  }

  return { relationEffects: next, growthDeltaByCountry };
}
