const DEFAULT_MAX_TURNS_HISTORY = 360;

export const CHART_METRICS = [
  { key: 'gdp', label: 'GDP', format: 'compact' },
  { key: 'gdpPerCapita', label: 'GDP per capita', format: 'compact' },
  { key: 'population', label: 'Population', format: 'compact' },
  { key: 'militaryPct', label: 'Military % GDP', format: 'percent' },
  { key: 'militarySpendAbs', label: 'Military spend', format: 'compact' },
  { key: 'power', label: 'Power', format: 'compact' },
  { key: 'stability', label: 'Stability', format: 'percent' },
  { key: 'influence', label: 'Influence', format: 'compact' },
  { key: 'avgBorderTension', label: 'Average border tension', format: 'number' }
];

const METRIC_KEYS = CHART_METRICS.map((metric) => metric.key);

function metricValue(metric, dyn, country, relations, neighbours, cca3) {
  if (metric === 'gdp') return Number(dyn?.gdp ?? 0);
  if (metric === 'population') return Number(country?.population ?? country?.indicators?.population ?? 0);
  if (metric === 'militaryPct') return Number(dyn?.militaryPct ?? 0);
  if (metric === 'militarySpendAbs') return Number(dyn?.militarySpendAbs ?? ((dyn?.gdp ?? 0) * ((dyn?.militaryPct ?? 0) / 100)));
  if (metric === 'power') return Number(dyn?.power ?? 0);
  if (metric === 'stability') return Number(dyn?.stability ?? 0);
  if (metric === 'influence') return Number(dyn?.influence ?? 0);
  if (metric === 'gdpPerCapita') {
    const pop = Number(country?.population ?? country?.indicators?.population ?? 0);
    return pop > 0 ? Number(dyn?.gdp ?? 0) / pop : 0;
  }
  if (metric === 'avgBorderTension') {
    const ns = neighbours?.[cca3] ?? [];
    if (!ns.length) return 0;
    const total = ns.reduce((sum, neighbourCode) => sum + Number(relations?.[cca3]?.[neighbourCode]?.tension ?? 0), 0);
    return total / ns.length;
  }
  return 0;
}

function createCountryMetricBuffers(maxTurnsHistory) {
  const entry = {};
  for (const metric of METRIC_KEYS) {
    entry[metric] = new Float64Array(maxTurnsHistory);
  }
  return entry;
}

export function createHistoryStore(countryCodes, maxTurnsHistory = DEFAULT_MAX_TURNS_HISTORY) {
  const sortedCountryCodes = [...countryCodes].sort((a, b) => a.localeCompare(b));
  const perCountry = {};
  for (const code of sortedCountryCodes) {
    perCountry[code] = createCountryMetricBuffers(maxTurnsHistory);
  }
  return {
    version: 1,
    maxTurnsHistory,
    cursor: 0,
    size: 0,
    turnBySlot: new Int32Array(maxTurnsHistory),
    countryCodes: sortedCountryCodes,
    perCountry
  };
}

export function recordHistoryTurn(history, state) {
  if (!history) return history;
  const slot = history.cursor;
  history.turnBySlot[slot] = state.turn;
  for (const cca3 of history.countryCodes) {
    const dyn = state.dynamic?.[cca3];
    const country = state.countryIndex?.[cca3];
    const buffers = history.perCountry[cca3];
    for (const metric of METRIC_KEYS) {
      buffers[metric][slot] = metricValue(metric, dyn, country, state.relations, state.neighbours, cca3);
    }
  }
  history.cursor = (history.cursor + 1) % history.maxTurnsHistory;
  history.size = Math.min(history.maxTurnsHistory, history.size + 1);
  return history;
}

function slotFromOffset(history, offset) {
  const oldestIndex = history.size === history.maxTurnsHistory ? history.cursor : 0;
  return (oldestIndex + offset) % history.maxTurnsHistory;
}

export function getHistoryTurns(history, range = 'all') {
  if (!history || history.size === 0) return [];
  const limit = range === '50' ? 50 : range === '200' ? 200 : history.size;
  const count = Math.min(history.size, limit);
  const firstOffset = history.size - count;
  const turns = [];
  for (let i = firstOffset; i < history.size; i += 1) {
    turns.push(history.turnBySlot[slotFromOffset(history, i)]);
  }
  return turns;
}

export function getCountryMetricSeries(history, cca3, metric, range = 'all') {
  if (!history || !history.perCountry?.[cca3]?.[metric] || history.size === 0) return [];
  const limit = range === '50' ? 50 : range === '200' ? 200 : history.size;
  const count = Math.min(history.size, limit);
  const firstOffset = history.size - count;
  const values = [];
  const source = history.perCountry[cca3][metric];
  for (let i = firstOffset; i < history.size; i += 1) {
    values.push(source[slotFromOffset(history, i)]);
  }
  return values;
}

export function getTopCountriesForMetric(state, metric, limit = 20) {
  const entries = Object.keys(state.dynamic ?? {}).map((code) => {
    const dyn = state.dynamic[code];
    const country = state.countryIndex?.[code];
    return {
      code,
      label: country?.name ?? code,
      value: metricValue(metric, dyn, country, state.relations, state.neighbours, code)
    };
  });
  entries.sort((a, b) => b.value - a.value || a.code.localeCompare(b.code));
  return entries.slice(0, limit);
}

export function serializeHistoryStore(history) {
  if (!history) return null;
  const serializedPerCountry = {};
  for (const code of history.countryCodes) {
    const metrics = {};
    for (const metric of METRIC_KEYS) {
      metrics[metric] = Array.from(history.perCountry[code][metric]);
    }
    serializedPerCountry[code] = metrics;
  }
  return {
    version: history.version,
    maxTurnsHistory: history.maxTurnsHistory,
    cursor: history.cursor,
    size: history.size,
    turnBySlot: Array.from(history.turnBySlot),
    countryCodes: [...history.countryCodes],
    perCountry: serializedPerCountry
  };
}

export function hydrateHistoryStore(serialized, countryCodes, fallbackMaxTurnsHistory = DEFAULT_MAX_TURNS_HISTORY) {
  if (!serialized || typeof serialized !== 'object') {
    return createHistoryStore(countryCodes, fallbackMaxTurnsHistory);
  }
  const maxTurnsHistory = Math.max(24, Number(serialized.maxTurnsHistory) || fallbackMaxTurnsHistory);
  const hydrated = createHistoryStore(countryCodes, maxTurnsHistory);
  hydrated.cursor = Math.max(0, Math.min(maxTurnsHistory - 1, Number(serialized.cursor) || 0));
  hydrated.size = Math.max(0, Math.min(maxTurnsHistory, Number(serialized.size) || 0));

  if (Array.isArray(serialized.turnBySlot)) {
    for (let i = 0; i < Math.min(maxTurnsHistory, serialized.turnBySlot.length); i += 1) {
      hydrated.turnBySlot[i] = Number(serialized.turnBySlot[i]) || 0;
    }
  }

  for (const code of hydrated.countryCodes) {
    const sourceMetrics = serialized.perCountry?.[code] ?? {};
    for (const metric of METRIC_KEYS) {
      const arr = Array.isArray(sourceMetrics[metric]) ? sourceMetrics[metric] : [];
      for (let i = 0; i < Math.min(maxTurnsHistory, arr.length); i += 1) {
        hydrated.perCountry[code][metric][i] = Number(arr[i]) || 0;
      }
    }
  }
  return hydrated;
}
