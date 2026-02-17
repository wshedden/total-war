export function rebuildPickCache(features, path) {
  return features.map((feature) => {
    const p = new Path2D(path(feature));
    const b = path.bounds(feature);
    return { feature, path2d: p, bbox: b };
  });
}

export function pickCountry(ctx, pickCache, x, y, tolerance = 3) {
  const candidates = pickCache.filter((entry) => {
    const [[x0, y0], [x1, y1]] = entry.bbox;
    return x >= x0 - tolerance && x <= x1 + tolerance && y >= y0 - tolerance && y <= y1 + tolerance;
  });
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    if (ctx.isPointInPath(candidates[i].path2d, x, y)) {
      return { cca3: candidates[i].feature.properties.cca3, candidates: candidates.length };
    }
  }
  return { cca3: null, candidates: candidates.length };
}
