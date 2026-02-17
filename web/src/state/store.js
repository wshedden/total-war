import { countryTurnRng } from '../util/rng.js';

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
    dynamic[country.cca3] = {
      gdp: country.indicators.gdp,
      militaryPct: country.indicators.militaryPercentGdp,
      relations: {},
      growthMod: 0,
      modTurns: 0,
      aiBias: 0.5
    };
  });
  return dynamic;
}

export function simulateTurn(state) {
  const nextTurn = state.turn + 1;
  const nextDynamic = {};
  const events = [];

  for (const [cca3, entry] of Object.entries(state.dynamic)) {
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

    nextDynamic[cca3] = { ...entry, gdp, militaryPct, aiBias, growthMod, modTurns };
  }

  return { ...state, turn: nextTurn, dynamic: nextDynamic, events: [...events, ...state.events].slice(0, 40) };
}
