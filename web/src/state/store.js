import { countryTurnRng } from '../util/rng.js';
import { initRelations, stepRelations } from './relationships.js';

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
  balanced: { growth: 0, stability: 0, trustDelta: 0 },
  conciliatory: { growth: 0.0015, stability: 0.002, trustDelta: 1 }
};

function getPolicy(entry) {
  const policy = entry.policy ?? {};
  return {
    milTargetPct: clamp(policy.milTargetPct ?? entry.militaryPct ?? 2.5, POLICY_MILITARY_MIN_PCT, POLICY_MILITARY_MAX_PCT),
    growthFocus: clamp(policy.growthFocus ?? 0.5, 0, 1),
    stabilityFocus: clamp(policy.stabilityFocus ?? 0.5, 0, 1),
    stance: STANCE_POLICY_EFFECTS[policy.stance] ? policy.stance : 'balanced'
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
        growthFocus: 0.5,
        stabilityFocus: 0.5,
        stance: 'balanced'
      },
      relations: {},
      growthMod: 0,
      modTurns: 0,
      aiBias: 0.5,
      growthRate: 0.01,
      stability: 0.55,
      militarySpendAbs,
      power: computePower(gdp, militaryPct, country.population ?? country.indicators.population ?? 0),
      influence: DEFAULT_INFLUENCE,
      policy: DEFAULT_POLICY,
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

export function simulateTurn(state) {
  const nextTurn = state.turn + 1;
  const nextDynamic = {};
  const events = [];
  const relationInputsByCountry = {};

  for (const [cca3, entry] of Object.entries(state.dynamic)) {
    const country = state.countryIndex[cca3];
    const rng = countryTurnRng(state.seed, nextTurn, cca3, 'sim');
    const drift = (rng() - 0.5) * 0.012;
    const eventRoll = rng();
    let growthMod = entry.modTurns > 0 ? entry.growthMod : 0;
    let modTurns = Math.max(0, entry.modTurns - 1);
    const policy = getPolicy(entry);
    const stanceEffects = STANCE_POLICY_EFFECTS[policy.stance];

    if (eventRoll < 0.012) {
      growthMod = rng() < 0.5 ? -0.018 : 0.02;
      modTurns = 3 + Math.floor(rng() * 4);
      events.push({ turn: nextTurn, cca3, text: growthMod > 0 ? 'Investment boom' : 'Economic shock' });
    }

    const growthPolicyMod = clamp(
      (policy.growthFocus - 0.5) * 0.01
        + (0.5 - policy.stabilityFocus) * 0.004
        + stanceEffects.growth,
      POLICY_GROWTH_MOD_MIN,
      POLICY_GROWTH_MOD_MAX
    );
    const stabilityPolicyDelta = clamp(
      (policy.stabilityFocus - 0.5) * 0.03
        - (policy.growthFocus - 0.5) * 0.012
        + stanceEffects.stability,
      POLICY_STABILITY_DELTA_MIN,
      POLICY_STABILITY_DELTA_MAX
    );
    const militaryDelta = clamp(
      policy.milTargetPct - entry.militaryPct,
      -POLICY_MILITARY_MAX_DELTA_PER_TURN,
      POLICY_MILITARY_MAX_DELTA_PER_TURN
    );

    const growth = 0.01 + drift + growthMod + growthPolicyMod;
    const gdp = Math.max(1, entry.gdp * (1 + growth));
    const aiBias = entry.aiBias;
    const militaryPct = clamp(entry.militaryPct + militaryDelta, POLICY_MILITARY_MIN_PCT, POLICY_MILITARY_MAX_PCT);
    const stability = clamp((entry.stability ?? 0.55) + stabilityPolicyDelta, 0, 1);
    const militarySpendAbs = gdp * (militaryPct / 100);
    const power = computePower(gdp, militaryPct, country?.population ?? 0);

    relationInputsByCountry[cca3] = {
      trustDelta: stanceEffects.trustDelta
    };

    nextDynamic[cca3] = {
      ...entry,
      gdp,
      militaryPct,
      aiBias,
      growthMod,
      modTurns,
      policy,
      growthRate: growth,
      stability,
      militarySpendAbs,
      power
    });
  }

  const relStep = stepRelations({
    turn: nextTurn,
    seed: state.seed,
    relations: state.relations,
    edges: state.relationEdges,
    dynamic: nextDynamic,
    relationInputsByCountry,
    events
  });

  for (const cca3 of Object.keys(nextDynamic)) {
    const postures = Object.values(relStep.postureByCountry[cca3] ?? {});
    const hostile = postures.filter((p) => p === 'Hostile').length;
    if (!postures.length) continue;
    const hostilityRate = hostile / postures.length;
    nextDynamic[cca3].militaryPct = clamp(
      nextDynamic[cca3].militaryPct + hostilityRate * 0.08,
      POLICY_MILITARY_MIN_PCT,
      POLICY_MILITARY_MAX_PCT
    );
    nextDynamic[cca3].militarySpendAbs = nextDynamic[cca3].gdp * (nextDynamic[cca3].militaryPct / 100);
    nextDynamic[cca3].power = computePower(nextDynamic[cca3].gdp, nextDynamic[cca3].militaryPct, state.countryIndex[cca3]?.population ?? 0);
  }

  return {
    ...state,
    turn: nextTurn,
    dynamic: nextDynamic,
    relations: relStep.relations,
    postureByCountry: relStep.postureByCountry,
    events: [...relStep.relationEvents, ...events, ...state.events].slice(0, 80)
  };
}
