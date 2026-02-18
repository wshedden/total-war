import { screenToWorld } from './camera.js';

const PICK_GRID_SIZE = 36;

function createSpatialIndex(entries) {
  const cells = new Map();

  for (const entry of entries) {
    const [[x0, y0], [x1, y1]] = entry.bbox;
    const minCellX = Math.floor(x0 / PICK_GRID_SIZE);
    const maxCellX = Math.floor(x1 / PICK_GRID_SIZE);
    const minCellY = Math.floor(y0 / PICK_GRID_SIZE);
    const maxCellY = Math.floor(y1 / PICK_GRID_SIZE);

    for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        const key = `${cellX}:${cellY}`;
        const bucket = cells.get(key);
        if (bucket) bucket.push(entry);
        else cells.set(key, [entry]);
      }
    }
  }

  return { cells, cellSize: PICK_GRID_SIZE };
}

function getCandidatesFromIndex(index, worldPoint, worldTolerance) {
  if (!index) return [];
  const { cells, cellSize } = index;
  const minCellX = Math.floor((worldPoint.x - worldTolerance) / cellSize);
  const maxCellX = Math.floor((worldPoint.x + worldTolerance) / cellSize);
  const minCellY = Math.floor((worldPoint.y - worldTolerance) / cellSize);
  const maxCellY = Math.floor((worldPoint.y + worldTolerance) / cellSize);
  const seen = new Set();
  const candidates = [];

  for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      const bucket = cells.get(`${cellX}:${cellY}`);
      if (!bucket) continue;
      for (const entry of bucket) {
        if (seen.has(entry)) continue;
        seen.add(entry);
        candidates.push(entry);
      }
    }
  }

  return candidates;
}

export function rebuildPickCache(features, path) {
  const entries = features.map((feature) => {
    const p = new Path2D(path(feature));
    const b = path.bounds(feature);
    return { feature, path2d: p, bbox: b };
  });
  entries.spatialIndex = createSpatialIndex(entries);
  return entries;
}

export function pickCountry(ctx, pickCache, camera, width, height, x, y, tolerance = 3) {
  const worldPoint = screenToWorld(camera, x, y, width, height);
  const worldTolerance = tolerance / camera.zoom;
  const indexedCandidates = getCandidatesFromIndex(pickCache.spatialIndex, worldPoint, worldTolerance);
  const candidates = indexedCandidates.filter((entry) => {
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
