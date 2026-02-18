import { el } from '../util/dom.js';

export function renderTopbar(container, actions) {
  const search = el('input');
  search.placeholder = 'Search country…';
  search.id = 'countrySearch';

  const pause = el('button', '', 'Pause');
  const step = el('button', '', 'Step');
  const speed = el('select');
  ['1','2','4'].forEach((s)=> {
    const o = el('option'); o.value = s; o.textContent = `x${s}`; speed.append(o);
  });

  const overlay = el('select');
  overlay.innerHTML = '<option value="political">Political</option><option value="diplomacy">Diplomacy</option><option value="heatmap">Data Heatmap</option>';
  const metric = el('select');
  metric.innerHTML = '<option value="gdp">GDP</option><option value="gdpPerCapita">GDP per capita</option><option value="population">Population</option><option value="militaryPercentGdp">Military % GDP</option>';

  const save = el('button', '', 'Save');
  const load = el('button', '', 'Load');
  const exportBtn = el('button', '', 'Export');
  const importBtn = el('button', '', 'Import');
  const newGame = el('button', '', 'New Game');
  const help = el('button', '', 'Help');

  pause.onclick = () => actions.togglePause();
  step.onclick = () => actions.stepTurn();
  speed.onchange = () => actions.setSpeed(Number(speed.value));
  overlay.onchange = () => actions.setOverlay(overlay.value);
  metric.onchange = () => actions.setMetric(metric.value);

  container.append(search, pause, step, speed, overlay, metric, save, load, exportBtn, importBtn, newGame, help);
  return { search, pause, step, speed, overlay, metric, save, load, exportBtn, importBtn, newGame, help };
}
