function getActiveMetricValue(metric, dynamicEntry, country) {
  if (metric === 'militaryPercentGdp') return dynamicEntry?.militaryPct;
  if (metric === 'gdp') return dynamicEntry?.gdp;
  return country?.indicators?.[metric];
}

let memoKey = '';
let memoDynamic = null;
let memoCountryIndex = null;
let memoRange = { min: 0, max: 1 };

export function selectActiveMetricRange(state) {
  const key = `${state.metric}:${state.turn}`;
  if (memoKey === key && memoDynamic === state.dynamic && memoCountryIndex === state.countryIndex) {
    return memoRange;
  }

  const values = Object.keys(state.dynamic)
    .map((cca3) => getActiveMetricValue(state.metric, state.dynamic[cca3], state.countryIndex[cca3]))
    .filter(Number.isFinite);

  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;

  memoKey = key;
  memoDynamic = state.dynamic;
  memoCountryIndex = state.countryIndex;
  memoRange = { min, max };
  return memoRange;
}

export function selectActiveMetricValue(state, cca3) {
  return getActiveMetricValue(state.metric, state.dynamic[cca3], state.countryIndex[cca3]);
}
