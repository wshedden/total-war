export const DEFAULT_INFLUENCE = 5;
export const DEFAULT_POLICY = Object.freeze({
  milTargetPct: 0.6,
  growthFocus: 50,
  stabilityFocus: 50,
  stance: 'neutral'
});

const STANCES = new Set(['conciliatory', 'neutral', 'hardline']);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toInt(value, fallback) {
  return Math.round(toNumber(value, fallback));
}

export function clampInfluence(value) {
  return clamp(toInt(value, DEFAULT_INFLUENCE), 0, 100);
}

export function clampPolicy(policy = {}) {
  const milTargetPct = clamp(toNumber(policy.milTargetPct, DEFAULT_POLICY.milTargetPct), 0.5, 10 / 12);
  const growthFocus = clamp(toInt(policy.growthFocus, DEFAULT_POLICY.growthFocus), 0, 100);
  const stabilityFocus = clamp(toInt(policy.stabilityFocus, DEFAULT_POLICY.stabilityFocus), 0, 100);
  const stance = STANCES.has(policy.stance) ? policy.stance : DEFAULT_POLICY.stance;
  return { milTargetPct, growthFocus, stabilityFocus, stance };
}

export function clampActionUsage(actionState = {}) {
  const actionUsedTurn = Number.isInteger(actionState.actionUsedTurn) ? actionState.actionUsedTurn : null;
  const cooldowns = Object.fromEntries(
    Object.entries(actionState.cooldowns ?? {}).map(([action, turns]) => [action, Math.max(0, toInt(turns, 0))])
  );
  return { actionUsedTurn, cooldowns };
}

export function normalizeDynamicEntry(entry = {}) {
  const actionState = clampActionUsage(entry);
  return {
    ...entry,
    influence: clampInfluence(entry.influence),
    policy: clampPolicy(entry.policy),
    actionUsedTurn: actionState.actionUsedTurn,
    cooldowns: actionState.cooldowns
  };
}

export function normalizeDynamicState(dynamic = {}, countryIndex = {}) {
  return Object.keys(countryIndex).reduce((acc, cca3) => {
    acc[cca3] = normalizeDynamicEntry(dynamic[cca3]);
    return acc;
  }, {});
}
