import { fmtCompact } from '../util/format.js';
import { selectActiveMetricRange } from '../state/metricRange.js';

export function renderLegend(node, state) {
  if (state.overlay === 'heatmap') {
    node.hidden = false;
    const { min, max } = selectActiveMetricRange(state);
    const markup = `<div><strong>${state.metric}</strong></div><div>${fmtCompact(min)} → ${fmtCompact(max)}</div>`;
    if (node.__lastMarkup !== markup) {
      node.innerHTML = markup;
      node.__lastMarkup = markup;
    }
    return;
  }

  if (state.overlay === 'diplomacy') {
    node.hidden = false;
    const markup = state.selected
      ? '<div><strong>Diplomacy</strong></div><div>Green: positive · Gray: neutral · Red: negative</div><div>Stroke intensity = border tension</div>'
      : '<div><strong>Diplomacy</strong></div><div>Select a country to view neighbour relations.</div>';
    if (node.__lastMarkup !== markup) {
      node.innerHTML = markup;
      node.__lastMarkup = markup;
    }
    return;
  }

  node.hidden = true;
}
