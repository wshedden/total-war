import { screenToWorld } from './camera.js';

export function rebuildPickCache(features, path) {
  return features.map((feature) => {
    const p = new Path2D(path(feature));
    const b = path.bounds(feature);
    return { feature, path2d: p, bbox: b };
  });
}

export function pickCountry(ctx, pickCache, camera, width, height, x, y, tolerance = 3) {
  const worldPoint = screenToWorld(camera, x, y, width, height);
  const worldTolerance = tolerance / camera.zoom;
  const candidates = pickCache.filter((entry) => {
    const [[x0, y0], [x1, y1]] = entry.bbox;
    return worldPoint.x >= x0 - worldTolerance
      && worldPoint.x <= x1 + worldTolerance
      && worldPoint.y >= y0 - worldTolerance
      && worldPoint.y <= y1 + worldTolerance;
  });
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    if (ctx.isPointInPath(candidates[i].path2d, worldPoint.x, worldPoint.y)) {
      return { cca3: candidates[i].feature.properties.cca3, candidates: candidates.length };
    }
  }
  return { cca3: null, candidates: candidates.length };
}
