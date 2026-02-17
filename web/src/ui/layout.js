import { el } from '../util/dom.js';

export function buildLayout(root) {
  const app = el('div', 'app');
  const topbar = el('div', 'topbar');
  const main = el('div', 'main');
  const mapWrap = el('div', 'map-wrap');
  const canvas = el('canvas');
  canvas.id = 'mapCanvas';
  const tooltip = el('div', 'tooltip');
  tooltip.hidden = true;
  const legend = el('div', 'legend');
  legend.hidden = true;
  const debug = el('div', 'debug');
  debug.hidden = true;
  const dossier = el('aside', 'dossier');

  mapWrap.append(canvas, tooltip, legend, debug);
  main.append(mapWrap, dossier);
  app.append(topbar, main);
  root.append(app);

  return { app, topbar, main, mapWrap, canvas, tooltip, legend, debug, dossier };
}
