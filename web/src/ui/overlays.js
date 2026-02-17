import { fmtCompact } from '../util/format.js';

export function renderLegend(node, state) {
  if (state.overlay !== 'heatmap') {
    node.hidden = true;
    return;
  }
  node.hidden = false;
  const values = Object.keys(state.dynamic).map((cca3) => {
    const d = state.dynamic[cca3];
    const c = state.countryIndex[cca3];
    return state.metric === 'militaryPercentGdp' ? d.militaryPct : state.metric === 'gdp' ? d.gdp : c.indicators[state.metric];
  }).filter(Number.isFinite);
  const min = Math.min(...values);
  const max = Math.max(...values);
  node.innerHTML = `<div><strong>${state.metric}</strong></div><div>${fmtCompact(min)} → ${fmtCompact(max)}</div>`;
}
