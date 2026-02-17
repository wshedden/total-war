import { feature } from 'topojson-client';
import { createProjection } from './projection.js';
import { heatmapColour, stableCountryColour } from './styles.js';
import { rebuildPickCache } from './picking.js';

export function createRenderer(canvas, topo, getState) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const world = feature(topo, topo.objects.countries);
  let width = 1;
  let height = 1;
  let pickCache = [];
  let path = null;
  let cameraKey = '';
  let metricRangeKey = '';
  let metricMin = 0;
  let metricMax = 1;

  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(alpha = 1) {
    const state = getState();
    const nextCameraKey = `${width}:${height}:${state.camera.x.toFixed(2)}:${state.camera.y.toFixed(2)}:${state.camera.zoom.toFixed(4)}`;
    if (nextCameraKey !== cameraKey || !path) {
      ({ path } = createProjection(width, height, state.camera));
      pickCache = rebuildPickCache(world.features, path);
      cameraKey = nextCameraKey;
    }

    const nextMetricRangeKey = `${state.metric}:${state.turn}`;
    if (nextMetricRangeKey !== metricRangeKey) {
      const metricValues = Object.keys(state.dynamic).map((cca3) => {
        const d = state.dynamic[cca3]; const c = state.countryIndex[cca3];
        return state.metric === 'militaryPercentGdp' ? d.militaryPct : state.metric === 'gdp' ? d.gdp : c.indicators[state.metric];
      }).filter(Number.isFinite);
      metricMin = Math.min(...metricValues);
      metricMax = Math.max(...metricValues);
      metricRangeKey = nextMetricRangeKey;
    }

    ctx.clearRect(0, 0, width, height);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    for (const entry of pickCache) {
      const { feature: f, path2d } = entry;
      const cca3 = f.properties.cca3;
      const dynamic = state.dynamic[cca3];
      const c = state.countryIndex[cca3];
      const value = state.metric === 'militaryPercentGdp' ? dynamic.militaryPct : state.metric === 'gdp' ? dynamic.gdp : c.indicators[state.metric];
      const t = (value - metricMin) / ((metricMax - metricMin) || 1);
      const fill = state.overlay === 'political' ? stableCountryColour(cca3, state.seed) : heatmapColour(t);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fill;
      ctx.fill(path2d);
      ctx.strokeStyle = '#1a2a3f';
      ctx.lineWidth = 0.75;
      ctx.stroke(path2d);
    }

    const hover = pickCache.find((e) => e.feature.properties.cca3 === state.hovered);
    if (hover) {
      ctx.save(); ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.2; ctx.stroke(hover.path2d); ctx.restore();
    }
    const selected = pickCache.find((e) => e.feature.properties.cca3 === state.selected);
    if (selected) {
      ctx.save(); ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2; ctx.stroke(selected.path2d); ctx.restore();
    }
  }

  return { ctx, world, resize, draw, getPickCache: () => pickCache };
}
