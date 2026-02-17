export function renderDebug(node, state) {
  node.hidden = !state.debug;
  if (!state.debug) return;
  node.innerHTML = `FPS ${state.debugInfo.fps}<br/>Turn ${state.turn}<br/>Hover ${state.hovered ?? '—'}<br/>Candidates ${state.debugInfo.candidates}<br/>Render ${state.debugInfo.renderMs.toFixed(2)} ms`;
}
