import { fmtCompact } from '../util/format.js';
import { selectActiveMetricRange } from '../state/metricRange.js';

export function renderLegend(node, state) {
  if (state.overlay !== 'heatmap') {
    node.hidden = true;
    return;
  }
  node.hidden = false;
  const { min, max } = selectActiveMetricRange(state);
  const markup = `<div><strong>${state.metric}</strong></div><div>${fmtCompact(min)} → ${fmtCompact(max)}</div>`;
  if (node.__lastMarkup !== markup) {
    node.innerHTML = markup;
    node.__lastMarkup = markup;
  }
}
