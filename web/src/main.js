import { buildLayout } from './ui/layout.js';
import { renderTopbar } from './ui/topbar.js';
import { wireSearch } from './ui/search.js';
import { renderDossier } from './ui/dossier.js';
import { renderTooltip } from './ui/tooltip.js';
import { renderLegend } from './ui/overlays.js';
import { renderDebug } from './ui/debug.js';
import { makeSnapshot, saveToLocal, loadFromLocal, exportJson, importJsonFile } from './ui/saveLoad.js';
import { createStore, createInitialSimState } from './state/store.js';
import { createActions } from './state/actions.js';
import { selectActiveMetricRange } from './state/metricRange.js';
import { createRenderer } from './map/renderer.js';
import { constrainCamera, fitCameraToFeature, zoomAtPoint } from './map/camera.js';
import { pickCountry } from './map/picking.js';
import { createFpsCounter } from './util/perf.js';
import { isTypingTarget } from './util/dom.js';

const root = document.getElementById('app');
root.textContent = 'Loading data…';
const [countries, topo] = await Promise.all([
  fetch('/api/countries').then((r) => r.json()),
  fetch('/api/borders').then((r) => r.json())
]);
const fullCountries = await Promise.all(countries.map((c) => fetch(`/api/countries/${c.cca3}`).then((r) => r.json())));
const countryIndex = Object.fromEntries(fullCountries.map((c) => [c.cca3, c]));

root.innerHTML = '';
const ui = buildLayout(root);
const store = createStore({
  seed: 1337,
  turn: 0,
  paused: true,
  speed: 1,
  hovered: null,
  selected: null,
  overlay: 'political',
  metric: 'gdp',
  search: '',
  dossierOpen: false,
  debug: false,
  events: [],
  camera: { x: 0, y: 0, zoom: 1 },
  countryIndex,
  dynamic: createInitialSimState(countryIndex)
});
const actions = createActions(store);
const controls = renderTopbar(ui.topbar, actions);
wireSearch(controls.search, fullCountries, actions);

controls.save.onclick = () => saveToLocal(makeSnapshot(store.getState()));
controls.load.onclick = () => { const s = loadFromLocal(); if (s) actions.loadState(s); };
controls.exportBtn.onclick = () => exportJson(makeSnapshot(store.getState()));
controls.importBtn.onclick = async () => { const s = await importJsonFile(); if (s) actions.loadState(s); };
controls.newGame.onclick = () => actions.loadState({ ...store.getState(), seed: (Math.random() * 1e9) | 0, turn: 0, events: [] });
controls.help.onclick = () => showHelp();

const renderer = createRenderer(ui.canvas, topo, store.getState);
renderer.resize();
actions.setCamera(constrainCamera(store.getState().camera, ui.canvas.clientWidth, ui.canvas.clientHeight));
let dirty = true;
let mouse = { x: 0, y: 0 };
let debugInfo = { fps: 0, candidates: 0, renderMs: 0 };
const fpsCounter = createFpsCounter();

store.subscribe(() => { dirty = true; });
window.addEventListener('resize', () => {
  renderer.resize();
  actions.setCamera(constrainCamera(store.getState().camera, ui.canvas.clientWidth, ui.canvas.clientHeight));
  dirty = true;
});

let drag = null;
ui.canvas.addEventListener('mousedown', (e) => {
  drag = { x: e.clientX, y: e.clientY, cam: store.getState().camera };
  ui.canvas.classList.add('dragging');
});
window.addEventListener('mouseup', () => { drag = null; ui.canvas.classList.remove('dragging'); });
window.addEventListener('mousemove', (e) => {
  mouse = { x: e.offsetX, y: e.offsetY };
  if (drag) {
    const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
    actions.setCamera(constrainCamera({ ...drag.cam, x: drag.cam.x + dx, y: drag.cam.y + dy }, ui.canvas.clientWidth, ui.canvas.clientHeight));
    return;
  }
  const hit = pickCountry(renderer.ctx, renderer.getPickCache(), store.getState().camera, ui.canvas.clientWidth, ui.canvas.clientHeight, e.offsetX, e.offsetY, 4);
  debugInfo.candidates = hit.candidates;
  actions.setHover(hit.cca3);
});
ui.canvas.addEventListener('click', (e) => {
  const hit = pickCountry(renderer.ctx, renderer.getPickCache(), store.getState().camera, ui.canvas.clientWidth, ui.canvas.clientHeight, e.offsetX, e.offsetY, 6);
  if (!hit.cca3) return;
  actions.selectCountry(hit.cca3);
  const entry = renderer.getPickCache().find((x) => x.feature.properties.cca3 === hit.cca3);
  if (entry) animateCamera(fitCameraToFeature(entry.feature, ui.canvas.clientWidth, ui.canvas.clientHeight));
});
ui.canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = Math.exp(-Math.sign(e.deltaY) * 0.08);
  actions.setCamera(zoomAtPoint(store.getState().camera, factor, e.offsetX, e.offsetY, ui.canvas.clientWidth, ui.canvas.clientHeight));
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeHelp();
  if (isTypingTarget()) return;
  if (e.code === 'Space') { e.preventDefault(); actions.togglePause(); }
  if (e.key === 'ArrowRight') actions.stepTurn();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); controls.search.focus(); }
  if (e.key.toLowerCase() === 'd') actions.toggleDebug();
});

let acc = 0;
let last = performance.now();
function frame(now) {
  const dt = (now - last) / 1000;
  last = now;
  const state = store.getState();
  if (!state.paused) {
    acc += dt * state.speed;
    while (acc >= 1) { actions.stepTurn(); acc -= 1; }
  }
  if (dirty) drawNow();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function drawNow() {
  dirty = false;
  const t0 = performance.now();
  renderer.draw();
  debugInfo.fps = fpsCounter.tick();
  debugInfo.renderMs = performance.now() - t0;
  const state = store.getState();
  renderDossier(ui.dossier, state);
  renderTooltip(ui.tooltip, state, mouse.x, mouse.y);
  renderLegend(ui.legend, {
    ...state,
    heatNorm(metric, dyn, c) {
      const v = metric === 'militaryPercentGdp' ? dyn.militaryPct : metric === 'gdp' ? dyn.gdp : c.indicators[metric];
      const rangeState = metric === state.metric ? state : { ...state, metric };
      const { min, max } = selectActiveMetricRange(rangeState);
      return (v - min) / ((max - min) || 1);
    }
  });
  renderDebug(ui.debug, { ...state, debugInfo });
}

function animateCamera(target) {
  const from = store.getState().camera;
  const t0 = performance.now();
  const dur = 380;
  function tick(now) {
    const p = Math.min(1, (now - t0) / dur);
    const e = p * (2 - p);
    actions.setCamera(constrainCamera({ zoom: from.zoom + (target.zoom - from.zoom) * e, x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e }, ui.canvas.clientWidth, ui.canvas.clientHeight));
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function showHelp() {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'helpModal';
  modal.innerHTML = '<div class="modal-card"><h2>Help</h2><p>Space pause/unpause · Right Arrow step · Ctrl+F focus search · D debug overlay.</p><button id="closeHelp">Close</button></div>';
  document.body.append(modal);
  modal.querySelector('#closeHelp').onclick = () => modal.remove();
}
function closeHelp() { document.getElementById('helpModal')?.remove(); }
