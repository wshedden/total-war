export const TURN_INFLUENCE_CONFIG = {
  baseGain: 1,
  stabilityGain: 1,
  topGdpGain: 1,
  stabilityThreshold: 0.7,
  topGdpPercentile: 0.15,
  maxInfluence: 50
};

export function rankCountriesByGdp(dynamic) {
  return Object.entries(dynamic)
    .map(([cca3, entry]) => ({ cca3, gdp: entry?.gdp ?? 0 }))
    .sort((a, b) => (b.gdp - a.gdp) || a.cca3.localeCompare(b.cca3));
}

export function buildTopGdpCountrySet(dynamic, percentile = TURN_INFLUENCE_CONFIG.topGdpPercentile) {
  const ranking = rankCountriesByGdp(dynamic);
  const count = Math.max(1, Math.ceil(ranking.length * percentile));
  return new Set(ranking.slice(0, count).map((item) => item.cca3));
}

export function computeInfluenceGain(entry, isTopGdpCountry, config = TURN_INFLUENCE_CONFIG) {
  let gain = config.baseGain;
  if ((entry?.stability ?? 0) >= config.stabilityThreshold) gain += config.stabilityGain;
  if (isTopGdpCountry) gain += config.topGdpGain;
  return gain;
}

export function applyInfluenceGain(entry, gain, maxInfluence = TURN_INFLUENCE_CONFIG.maxInfluence) {
  const influence = Math.max(0, entry?.influence ?? 0);
  return Math.min(maxInfluence, influence + gain);
}

