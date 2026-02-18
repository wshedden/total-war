import { feature } from 'topojson-client';
import { createProjection } from './projection.js';
import { heatmapColour, stableCountryColour } from './styles.js';
import { rebuildPickCache } from './picking.js';
import { applyCameraTransform } from './camera.js';
import { selectActiveMetricRange, selectActiveMetricValue } from '../state/metricRange.js';

export function createRenderer(canvas, topo, getState) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const world = feature(topo, topo.objects.countries);
  let width = 1;
  let height = 1;
  let pickCache = [];
  let pickByCca3 = {};
  let geometryKey = '';
  let spherePath2d = null;

  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function ensureGeometryCache() {
    const nextGeometryKey = `${width}:${height}:naturalEarth1`;
    if (nextGeometryKey === geometryKey && pickCache.length && spherePath2d) return;

    const { path } = createProjection(width, height);
    pickCache = rebuildPickCache(world.features, path);
    pickByCca3 = {};
    for (const entry of pickCache) {
      pickByCca3[entry.feature.properties.cca3] = entry;
    }
    spherePath2d = new Path2D(path({ type: 'Sphere' }));
    geometryKey = nextGeometryKey;
  }

  function draw(alpha = 1) {
    const state = getState();
    ensureGeometryCache();

    const { min: metricMin, max: metricMax } = selectActiveMetricRange(state);

    ctx.clearRect(0, 0, width, height);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.save();
    applyCameraTransform(ctx, state.camera, width, height);

    if (spherePath2d) {
      ctx.fillStyle = '#0d1828';
      ctx.globalAlpha = 0.3;
      ctx.fill(spherePath2d);
    }

    for (const entry of pickCache) {
      const { feature: f, path2d } = entry;
      const cca3 = f.properties.cca3;
      const value = selectActiveMetricValue(state, cca3);
      const t = (value - metricMin) / ((metricMax - metricMin) || 1);
      const fill = state.overlay === 'political' ? stableCountryColour(cca3, state.seed) : heatmapColour(t);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fill;
      ctx.fill(path2d);
      ctx.strokeStyle = '#1a2a3f';
      ctx.lineWidth = 0.75 / state.camera.zoom;
      ctx.stroke(path2d);
    }

    if (spherePath2d) {
      ctx.save();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(166, 202, 244, 0.55)';
      ctx.lineWidth = 1.4 / state.camera.zoom;
      ctx.stroke(spherePath2d);
      ctx.restore();
    }

    const hover = pickByCca3[state.hovered];
    if (hover) {
      ctx.save();
      ctx.setLineDash([4 / state.camera.zoom, 4 / state.camera.zoom]);
      ctx.strokeStyle = 'rgba(255,255,255,.8)';
      ctx.lineWidth = 1.2 / state.camera.zoom;
      ctx.stroke(hover.path2d);
      ctx.restore();
    }
    const selected = pickByCca3[state.selected];
    if (selected) {
      ctx.save();
      ctx.setLineDash([6 / state.camera.zoom, 4 / state.camera.zoom]);
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2 / state.camera.zoom;
      ctx.stroke(selected.path2d);
      ctx.restore();
    }

    ctx.restore();
  }

  return { ctx, world, resize, draw, getPickCache: () => pickCache };
}
