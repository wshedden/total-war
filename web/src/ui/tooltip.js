import { fmtCompact } from '../util/format.js';

export function renderTooltip(node, state, x, y) {
  if (!state.hovered) {
    node.hidden = true;
    return;
  }
  const c = state.countryIndex[state.hovered];
  const d = state.dynamic[state.hovered];
  node.hidden = false;
  node.style.left = `${x + 14}px`;
  node.style.top = `${y + 14}px`;
  node.innerHTML = `<strong>${c?.name ?? state.hovered}</strong><div>Pop: ${fmtCompact(c?.population)}</div><div>GDP: ${fmtCompact(d?.gdp)}</div>`;
}
