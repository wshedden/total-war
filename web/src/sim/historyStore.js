import { mean } from '../util/stats.js';

export const CHART_METRICS = {
  gdp: { label: 'GDP', format: 'number' },
  gdpPerCapita: { label: 'GDP per capita', format: 'number' },
  population: { label: 'Population', format: 'number' },
  militaryPercentGdp: { label: 'Military % GDP', format: 'percent' },
  militarySpendAbs: { label: 'Military spend', format: 'number' },
  power: { label: 'Power', format: 'number' },
  stability: { label: 'Stability', format: 'percent' },
  influence: { label: 'Influence', format: 'number' },
  avgBorderTension: { label: 'Average border tension', format: 'number' }
};

export const DEFAULT_HISTORY_MAX_TURNS = 360;

function emptyMetricSeries(maxTurns) {
  return new Array(maxTurns).fill(null);
}

function createMetricBuckets(countryCodes, maxTurns, metrics) {
  const perCountry = {};
  for (const code of countryCodes) {
    perCountry[code] = Object.fromEntries(metrics.map((metric) => [metric, emptyMetricSeries(maxTurns)]));
  }
  return perCountry;
}

function getMetricValue(metric, state, cca3) {
  const country = state.countryIndex?.[cca3];
  const dynamic = state.dynamic?.[cca3];
  if (!country || !dynamic) return null;
  const population = country.population ?? country.indicators?.population ?? 0;

  if (metric === 'gdp') return dynamic.gdp;
  if (metric === 'gdpPerCapita') return population > 0 ? dynamic.gdp / population : null;
  if (metric === 'population') return population;
  if (metric === 'militaryPercentGdp') return dynamic.militaryPct;
  if (metric === 'militarySpendAbs') return dynamic.militarySpendAbs ?? dynamic.gdp * ((dynamic.militaryPct ?? 0) / 100);
  if (metric === 'power') return dynamic.power;
  if (metric === 'stability') return dynamic.stability;
  if (metric === 'influence') return dynamic.influence;
  if (metric === 'avgBorderTension') {
    const neighbours = state.neighbours?.[cca3] ?? [];
    if (!neighbours.length) return null;
    return mean(neighbours.map((other) => state.relations?.[cca3]?.[other]?.tension ?? null));
  }
  return null;
}

export function createHistoryStore(state, options = {}) {
  const countryCodes = Object.keys(state.countryIndex ?? {}).sort((a, b) => a.localeCompare(b));
  const metrics = options.metrics ?? Object.keys(CHART_METRICS);
  const maxTurns = Math.max(30, Number(options.maxTurns ?? DEFAULT_HISTORY_MAX_TURNS) | 0);
  return {
    version: 1,
    maxTurns,
    metrics,
    countryCodes,
    head: -1,
    length: 0,
    turns: emptyMetricSeries(maxTurns),
    perCountry: createMetricBuckets(countryCodes, maxTurns, metrics)
  };
}

export function recordHistoryTurn(history, state, turn = state.turn) {
  if (!history) return history;
  const slot = (history.head + 1) % history.maxTurns;
  history.head = slot;
  history.length = Math.min(history.length + 1, history.maxTurns);
  history.turns[slot] = turn;

  for (const cca3 of history.countryCodes) {
    const countrySeries = history.perCountry[cca3];
    for (const metric of history.metrics) {
      countrySeries[metric][slot] = getMetricValue(metric, state, cca3);
    }
  }
  return history;
}

function orderedSlots(history) {
  if (!history?.length) return [];
  const slots = [];
  const start = (history.head - history.length + 1 + history.maxTurns) % history.maxTurns;
  for (let i = 0; i < history.length; i += 1) {
    slots.push((start + i) % history.maxTurns);
  }
  return slots;
}

export function getHistorySeries(history, metric, countryCodes, range = 'stored') {
  const slots = orderedSlots(history);
  const maxPoints = range === '50' ? 50 : range === '200' ? 200 : slots.length;
  const scopedSlots = maxPoints >= slots.length ? slots : slots.slice(slots.length - maxPoints);
  const turns = scopedSlots.map((slot) => history.turns[slot]);
  const series = countryCodes.map((code) => ({
    code,
    values: scopedSlots.map((slot) => history.perCountry?.[code]?.[metric]?.[slot] ?? null)
  }));
  return { turns, series };
}

export function getWorldTopCountries(state, metric, limit = 20) {
  const rows = Object.keys(state.dynamic ?? {}).map((code) => ({
    code,
    value: getMetricValue(metric, state, code) ?? Number.NEGATIVE_INFINITY
  }));
  rows.sort((a, b) => b.value - a.value || a.code.localeCompare(b.code));
  return rows.filter((row) => Number.isFinite(row.value)).slice(0, limit);
}

export function serialiseHistory(history) {
  if (!history) return null;
  return {
    version: history.version,
    maxTurns: history.maxTurns,
    metrics: history.metrics,
    countryCodes: history.countryCodes,
    head: history.head,
    length: history.length,
    turns: history.turns,
    perCountry: history.perCountry
  };
}

export function hydrateHistory(raw, state) {
  const fallback = createHistoryStore(state);
  if (!raw || typeof raw !== 'object') return fallback;
  const metrics = Array.isArray(raw.metrics) ? raw.metrics.filter((metric) => CHART_METRICS[metric]) : fallback.metrics;
  const countryCodes = Array.isArray(raw.countryCodes)
    ? raw.countryCodes.filter((code) => state.countryIndex?.[code])
    : fallback.countryCodes;
  const maxTurns = Math.max(30, Number(raw.maxTurns) | 0) || fallback.maxTurns;
  const history = {
    version: 1,
    maxTurns,
    metrics,
    countryCodes,
    head: Number.isFinite(raw.head) ? raw.head : -1,
    length: Number.isFinite(raw.length) ? raw.length : 0,
    turns: Array.isArray(raw.turns) ? raw.turns.slice(0, maxTurns) : emptyMetricSeries(maxTurns),
    perCountry: createMetricBuckets(countryCodes, maxTurns, metrics)
  };
  for (const code of countryCodes) {
    for (const metric of metrics) {
      const source = raw.perCountry?.[code]?.[metric];
      if (Array.isArray(source)) history.perCountry[code][metric] = source.slice(0, maxTurns);
    }
  }
  history.head = Math.max(-1, Math.min(maxTurns - 1, history.head));
  history.length = Math.max(0, Math.min(maxTurns, history.length));
  if (history.turns.length < maxTurns) history.turns.push(...emptyMetricSeries(maxTurns - history.turns.length));
  return history;
}
