import { countryTurnRng } from '../util/rng.js';
import { initRelations, stepRelations } from './relationships.js';
import { TURN_INFLUENCE_CONFIG, buildTopGdpCountrySet, computeInfluenceGain, applyInfluenceGain } from './influence.js';

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
      relations: {},
      growthMod: 0,
      modTurns: 0,
      aiBias: 0.5,
      growthRate: 0.01,
      stability: 0.55,
      influence: 0,
      militarySpendAbs,
      power: computePower(gdp, militaryPct, country.population ?? country.indicators.population ?? 0)
    };
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

  for (const [cca3, entry] of Object.entries(state.dynamic)) {
    const country = state.countryIndex[cca3];
    const rng = countryTurnRng(state.seed, nextTurn, cca3, 'sim');
    const drift = (rng() - 0.5) * 0.012;
    const eventRoll = rng();
    let growthMod = entry.modTurns > 0 ? entry.growthMod : 0;
    let modTurns = Math.max(0, entry.modTurns - 1);

    if (eventRoll < 0.012) {
      growthMod = rng() < 0.5 ? -0.018 : 0.02;
      modTurns = 3 + Math.floor(rng() * 4);
      events.push({ turn: nextTurn, cca3, text: growthMod > 0 ? 'Investment boom' : 'Economic shock' });
    }

    const growth = 0.01 + drift + growthMod;
    const gdp = Math.max(1, entry.gdp * (1 + growth));
    const aiBias = Math.min(0.9, Math.max(0.1, entry.aiBias + (rng() - 0.5) * 0.05));
    const militaryPct = Math.max(0.2, Math.min(12, entry.militaryPct + (aiBias - 0.5) * 0.18 + (rng() - 0.5) * 0.08));
    const stability = Math.max(0, Math.min(1, (entry.stability ?? 0.55) + (rng() - 0.5) * 0.04));
    const militarySpendAbs = gdp * (militaryPct / 100);
    const power = computePower(gdp, militaryPct, country?.population ?? 0);

    nextDynamic[cca3] = {
      ...entry,
      gdp,
      militaryPct,
      aiBias,
      growthMod,
      modTurns,
      growthRate: growth,
      stability,
      militarySpendAbs,
      power
    };
  }

  const relStep = stepRelations({
    turn: nextTurn,
    seed: state.seed,
    relations: state.relations,
    edges: state.relationEdges,
    dynamic: nextDynamic,
    events
  });

  for (const cca3 of Object.keys(nextDynamic)) {
    const postures = Object.values(relStep.postureByCountry[cca3] ?? {});
    const hostile = postures.filter((p) => p === 'Hostile').length;
    if (!postures.length) continue;
    const hostilityRate = hostile / postures.length;
    nextDynamic[cca3].militaryPct = Math.max(0.2, Math.min(12, nextDynamic[cca3].militaryPct + hostilityRate * 0.08));
    nextDynamic[cca3].militarySpendAbs = nextDynamic[cca3].gdp * (nextDynamic[cca3].militaryPct / 100);
    nextDynamic[cca3].power = computePower(nextDynamic[cca3].gdp, nextDynamic[cca3].militaryPct, state.countryIndex[cca3]?.population ?? 0);
  }

  const topGdpCountries = buildTopGdpCountrySet(nextDynamic, TURN_INFLUENCE_CONFIG.topGdpPercentile);
  for (const [cca3, entry] of Object.entries(nextDynamic)) {
    const gain = computeInfluenceGain(entry, topGdpCountries.has(cca3), TURN_INFLUENCE_CONFIG);
    nextDynamic[cca3].influence = applyInfluenceGain(entry, gain, TURN_INFLUENCE_CONFIG.maxInfluence);
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
