import { countryTurnRng, pairKey } from '../util/rng.js';
import { initRelations, stepRelations } from './relationships.js';
import { TURN_INFLUENCE_CONFIG, buildTopGdpCountrySet, computeInfluenceGain, applyInfluenceGain } from './influence.js';
import { normalizeDynamicEntry, DEFAULT_INFLUENCE, DEFAULT_POLICY } from './policies.js';
import { planActions, applyPlannedActions } from './diplomaticActions.js';
import { createInitialRelationEffectsState, runRelationEffectsStage } from './relationEffects.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Policy stage tuning constants (kept close to simulation logic for easy balancing).
const POLICY_MILITARY_MIN_PCT = 0.2;
const POLICY_MILITARY_MAX_PCT = 12;
const POLICY_MILITARY_MAX_DELTA_PER_TURN = 0.2;
const POLICY_GROWTH_MOD_MIN = -0.02;
const POLICY_GROWTH_MOD_MAX = 0.02;
const POLICY_STABILITY_DELTA_MIN = -0.03;
const POLICY_STABILITY_DELTA_MAX = 0.03;

const STANCE_POLICY_EFFECTS = {
  hardline: { growth: -0.0015, stability: -0.002, trustDelta: -1 },
  neutral: { growth: 0, stability: 0, trustDelta: 0 },
  conciliatory: { growth: 0.0015, stability: 0.002, trustDelta: 1 }
};

function getPolicy(entry) {
  const policy = entry.policy ?? {};
  return {
    milTargetPct: clamp(policy.milTargetPct ?? entry.militaryPct ?? 2.5, POLICY_MILITARY_MIN_PCT, POLICY_MILITARY_MAX_PCT),
    growthFocus: clamp(policy.growthFocus ?? 0.5, 0, 1),
    stabilityFocus: clamp(policy.stabilityFocus ?? 0.5, 0, 1),
    stance: STANCE_POLICY_EFFECTS[policy.stance] ? policy.stance : 'neutral'
  };
}

function computePower(gdp, militaryPct, population) {
  const milAbs = Math.max(0, gdp * (militaryPct / 100));
  return Math.sqrt(milAbs) * 0.6 + Math.sqrt(Math.max(0, gdp)) * 0.3 + Math.sqrt(Math.max(0, population)) * 0.1;
}

export function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();
  return {
    getState: () => state,
    setState(update) {
      state = typeof update === 'function' ? update(state) : { ...state, ...update };
      listeners.forEach((fn) => fn(state));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
}

export function createInitialSimState(countryIndex) {
  const dynamic = {};
  Object.values(countryIndex).forEach((country) => {
    const gdp = country.indicators.gdp;
    const militaryPct = country.indicators.militaryPercentGdp;
    const militarySpendAbs = gdp * (militaryPct / 100);
    dynamic[country.cca3] = {
      gdp,
      militaryPct,
      policy: {
        milTargetPct: clamp(militaryPct, POLICY_MILITARY_MIN_PCT, POLICY_MILITARY_MAX_PCT),
        growthFocus: DEFAULT_POLICY.growthFocus,
        stabilityFocus: DEFAULT_POLICY.stabilityFocus,
        stance: DEFAULT_POLICY.stance
      },
      relations: {},
      growthMod: 0,
      modTurns: 0,
      aiBias: 0.5,
      growthRate: 0.01,
      stability: 0.55,
      influence: DEFAULT_INFLUENCE,
      militarySpendAbs,
      power: computePower(gdp, militaryPct, country.population ?? country.indicators.population ?? 0),
      actionUsedTurn: null,
      cooldowns: {}
    };
    dynamic[country.cca3] = normalizeDynamicEntry(dynamic[country.cca3]);
  });
  return dynamic;
}

export function createInitialRelations(seed, neighbours, countryIndex) {
  return initRelations(seed, neighbours, countryIndex);
}

export function createInitialRelationEffects() {
  return createInitialRelationEffectsState();
}

export function simulateTurn(state) {
  const nextTurn = state.turn + 1;
  const countryCodes = Object.keys(state.dynamic).sort((a, b) => a.localeCompare(b));
  const sortedRelationEdges = [...(state.relationEdges ?? [])].sort((left, right) => {
    const [a1, b1] = left;
    const [a2, b2] = right;
    return pairKey(a1, b1).localeCompare(pairKey(a2, b2));
  });

  const nextDynamic = {};
  const events = [];
  const relationInputsByCountry = {};
  const economyInputsByCountry = {};
  const relationEffectsStage = runRelationEffectsStage(state.relationEffects, nextTurn);

  // Stage 1: policy adjustments (deterministic country iteration by sorted cca3).
  for (const cca3 of countryCodes) {
    const entry = state.dynamic[cca3];
    const policy = getPolicy(entry);
    const stanceEffects = STANCE_POLICY_EFFECTS[policy.stance];
    const militaryDelta = clamp(
      policy.milTargetPct - entry.militaryPct,
      -POLICY_MILITARY_MAX_DELTA_PER_TURN,
      POLICY_MILITARY_MAX_DELTA_PER_TURN
    );
    const militaryPct = clamp(entry.militaryPct + militaryDelta, POLICY_MILITARY_MIN_PCT, POLICY_MILITARY_MAX_PCT);
    const stabilityPolicyDelta = clamp(
      (policy.stabilityFocus - 0.5) * 0.03
        - (policy.growthFocus - 0.5) * 0.012
        + stanceEffects.stability,
      POLICY_STABILITY_DELTA_MIN,
      POLICY_STABILITY_DELTA_MAX
    );

    nextDynamic[cca3] = {
      ...entry,
      policy,
      militaryPct,
      stability: clamp((entry.stability ?? 0.55) + stabilityPolicyDelta, 0, 1)
    };
  }

  // Stage 2: derived stats from policy-adjusted values.
  for (const cca3 of countryCodes) {
    const entry = nextDynamic[cca3];
    const country = state.countryIndex[cca3];
    entry.militarySpendAbs = entry.gdp * (entry.militaryPct / 100);
    entry.power = computePower(entry.gdp, entry.militaryPct, country?.population ?? 0);
  }

  // Stage 3: base events and per-country turn inputs.
  for (const cca3 of countryCodes) {
    const entry = nextDynamic[cca3];
    const rng = countryTurnRng(state.seed, nextTurn, cca3, 'sim');
    const stanceEffects = STANCE_POLICY_EFFECTS[entry.policy.stance];
    const drift = (rng() - 0.5) * 0.012;
    const eventRoll = rng();
    let growthMod = entry.modTurns > 0 ? entry.growthMod : 0;
    let modTurns = Math.max(0, entry.modTurns - 1);

    if (eventRoll < 0.012) {
      growthMod = rng() < 0.5 ? -0.018 : 0.02;
      modTurns = 3 + Math.floor(rng() * 4);
      events.push({ turn: nextTurn, cca3, text: growthMod > 0 ? 'Investment boom' : 'Economic shock' });
    }

    const growthPolicyMod = clamp(
      (entry.policy.growthFocus - 0.5) * 0.01
        + (0.5 - entry.policy.stabilityFocus) * 0.004
        + stanceEffects.growth,
      POLICY_GROWTH_MOD_MIN,
      POLICY_GROWTH_MOD_MAX
    );

    relationInputsByCountry[cca3] = {
      trustDelta: stanceEffects.trustDelta
    };

    economyInputsByCountry[cca3] = {
      drift,
      growthMod,
      modTurns,
      growthPolicyMod
    };

    entry.growthMod = growthMod;
    entry.modTurns = modTurns;
  }

  // Stage 4: plan/apply diplomacy actions on a deterministic snapshot.
  const plannedActions = planActions({
    ...state,
    turn: nextTurn,
    dynamic: nextDynamic,
    relations: state.relations,
    relationEdges: sortedRelationEdges
  });
  const diplomaticStep = applyPlannedActions({
    ...state,
    turn: nextTurn,
    dynamic: nextDynamic,
    relations: state.relations,
    relationEdges: sortedRelationEdges
  }, plannedActions);

  // Stage 5: passive relation step (stable sorted edge tuples).
  const relStep = stepRelations({
    turn: nextTurn,
    seed: state.seed,
    relations: diplomaticStep.relations,
    edges: sortedRelationEdges,
    dynamic: diplomaticStep.dynamic,
    relationInputsByCountry,
    events
  });

  for (const cca3 of countryCodes) {
    const postures = Object.entries(relStep.postureByCountry[cca3] ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, posture]) => posture);
    const hostile = postures.filter((p) => p === 'Hostile').length;
    if (!postures.length) continue;
    const hostilityRate = hostile / postures.length;
    diplomaticStep.dynamic[cca3].militaryPct = clamp(
      diplomaticStep.dynamic[cca3].militaryPct + hostilityRate * 0.08,
      POLICY_MILITARY_MIN_PCT,
      POLICY_MILITARY_MAX_PCT
    );
    diplomaticStep.dynamic[cca3].militarySpendAbs = diplomaticStep.dynamic[cca3].gdp * (diplomaticStep.dynamic[cca3].militaryPct / 100);
    diplomaticStep.dynamic[cca3].power = computePower(
      diplomaticStep.dynamic[cca3].gdp,
      diplomaticStep.dynamic[cca3].militaryPct,
      state.countryIndex[cca3]?.population ?? 0
    );
  }

  // Stage 6: economy update.
  for (const cca3 of countryCodes) {
    const entry = diplomaticStep.dynamic[cca3];
    const economy = economyInputsByCountry[cca3];
    const growth = 0.01
      + economy.drift
      + economy.growthMod
      + economy.growthPolicyMod
      + (relationEffectsStage.growthDeltaByCountry[cca3] ?? 0);
    const gdp = Math.max(1, entry.gdp * (1 + growth));

    entry.gdp = gdp;
    entry.growthRate = growth;
    entry.militarySpendAbs = gdp * (entry.militaryPct / 100);
    entry.power = computePower(gdp, entry.militaryPct, state.countryIndex[cca3]?.population ?? 0);
  }

  // Stage 7: influence gain.
  const topGdpCountries = buildTopGdpCountrySet(diplomaticStep.dynamic, TURN_INFLUENCE_CONFIG.topGdpPercentile);
  for (const cca3 of countryCodes) {
    const entry = diplomaticStep.dynamic[cca3];
    const gain = computeInfluenceGain(entry, topGdpCountries.has(cca3), TURN_INFLUENCE_CONFIG);
    entry.influence = applyInfluenceGain(entry, gain, TURN_INFLUENCE_CONFIG.maxInfluence);
  }

  return {
    ...state,
    turn: nextTurn,
    dynamic: diplomaticStep.dynamic,
    relations: relStep.relations,
    postureByCountry: relStep.postureByCountry,
    relationEffects: diplomaticStep.relationEffects ?? relationEffectsStage.relationEffects,
    queuedPlayerAction: null,
    events: [...diplomaticStep.events, ...relStep.relationEvents, ...events, ...state.events].slice(0, 80)
  };
}
