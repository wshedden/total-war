const NATURAL_EARTH_BOUNDS = {
  widthAtZoom1: 1.039446,
  heightAtZoom1: 0.540509
};

export const CAMERA_LIMITS = { minZoom: 0.9, maxZoom: 7 };

export function clampZoom(zoom) {
  return Math.max(CAMERA_LIMITS.minZoom, Math.min(CAMERA_LIMITS.maxZoom, zoom));
}

export function clampCamera(camera, width, height) {
  const zoom = clampZoom(camera.zoom);
  const minDim = Math.max(1, Math.min(width, height));
  const mapW = minDim * NATURAL_EARTH_BOUNDS.widthAtZoom1 * zoom;
  const mapH = minDim * NATURAL_EARTH_BOUNDS.heightAtZoom1 * zoom;
  const pad = 24;

  const minX = -width / 2 + mapW / 2 + pad;
  const maxX = width / 2 - mapW / 2 - pad;
  const minY = -height / 2 + mapH / 2 + pad;
  const maxY = height / 2 - mapH / 2 - pad;

  const x = minX > maxX ? 0 : Math.max(minX, Math.min(maxX, camera.x));
  const y = minY > maxY ? 0 : Math.max(minY, Math.min(maxY, camera.y));
  return { zoom, x, y };
}

export function zoomAtPoint(camera, factor, px, py, width, height) {
  const nextZoom = clampZoom(camera.zoom * factor);
  const zf = nextZoom / camera.zoom;
  const next = {
    zoom: nextZoom,
    x: px - (px - camera.x) * zf,
    y: py - (py - camera.y) * zf
  };
  return clampCamera(next, width, height);
}

export function fitCameraToBbox(bbox, width, height, camera) {
  const [[x0, y0], [x1, y1]] = bbox;
  const bw = Math.max(1, x1 - x0);
  const bh = Math.max(1, y1 - y0);
  const margin = 0.18;
  const zoom = clampZoom(Math.min(width * (1 - margin) / bw, height * (1 - margin) / bh));
  const ratio = zoom / camera.zoom;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const target = {
    zoom,
    x: (camera.x + width / 2 - cx) * ratio,
    y: (camera.y + height / 2 - cy) * ratio
  };
  return clampCamera(target, width, height);
}
