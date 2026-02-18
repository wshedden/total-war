import { feature } from 'topojson-client';
import { createProjection } from './projection.js';
import { heatmapColour, stableCountryColour } from './styles.js';
import { rebuildPickCache } from './picking.js';
import { applyCameraTransform } from './camera.js';
import { selectActiveMetricRange, selectActiveMetricValue } from '../state/metricRange.js';

function diplomacyFill(state, cca3) {
  if (!state.selected) return '#2a3c55';
  if (cca3 === state.selected) return '#f2c14e';
  const edge = state.relations?.[state.selected]?.[cca3];
  if (!edge) return '#1a2433';
  const rel = edge.rel;
  if (rel >= 35) return '#2f8f66';
  if (rel <= -35) return '#a64f4f';
  return '#6e7787';
}

function relationStroke(state, cca3) {
  const edge = state.selected ? state.relations?.[state.selected]?.[cca3] : null;
  if (!edge) return null;
  const t = edge.tension / 100;
  const width = 0.7 + t * 2.8;
  const alpha = 0.15 + t * 0.7;
  const hue = 125 - t * 125;
  return { stroke: `hsla(${hue} 85% 60% / ${alpha})`, width };
}

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
      const fill = state.overlay === 'heatmap'
        ? heatmapColour(t)
        : state.overlay === 'diplomacy'
          ? diplomacyFill(state, cca3)
          : stableCountryColour(cca3, state.seed);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fill;
      ctx.fill(path2d);
      ctx.strokeStyle = '#1a2a3f';
      ctx.lineWidth = 0.75 / state.camera.zoom;
      ctx.stroke(path2d);

      if (state.overlay === 'diplomacy' && state.selected) {
        const border = relationStroke(state, cca3);
        if (border) {
          ctx.strokeStyle = border.stroke;
          ctx.lineWidth = border.width / state.camera.zoom;
          ctx.stroke(path2d);
        }
      }
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
