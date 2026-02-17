import { hashString } from '../util/rng.js';

export function stableCountryColour(cca3, seed) {
  const h = hashString(`${seed}:${cca3}`) % 360;
  return `hsl(${h} 42% 44%)`;
}

export function heatmapColour(t) {
  const x = Math.max(0, Math.min(1, t));
  const hue = 220 - x * 180;
  return `hsl(${hue} 74% ${38 + x * 18}%)`;
}
