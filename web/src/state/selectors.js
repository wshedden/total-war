import { TURN_INFLUENCE_CONFIG, buildTopGdpCountrySet, computeInfluenceGain, applyInfluenceGain } from './influence.js';

export function selectNextTurnGainHint(state, cca3, config = TURN_INFLUENCE_CONFIG) {
  const entry = state?.dynamic?.[cca3];
  if (!entry) return null;

  const topGdpCountries = buildTopGdpCountrySet(state.dynamic, config.topGdpPercentile);
  const inTopGdpPercentile = topGdpCountries.has(cca3);
  const gain = computeInfluenceGain(entry, inTopGdpPercentile, config);
  const nextInfluence = applyInfluenceGain(entry, gain, config.maxInfluence);

  return {
    gain,
    nextInfluence,
    maxInfluence: config.maxInfluence,
    reasons: {
      base: true,
      stability: (entry.stability ?? 0) >= config.stabilityThreshold,
      topGdpPercentile: inTopGdpPercentile
    }
  };
}

