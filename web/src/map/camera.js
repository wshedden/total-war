export const CAMERA_LIMITS = { minZoom: 0.55, maxZoom: 7 };

export function clampZoom(zoom) {
  return Math.max(CAMERA_LIMITS.minZoom, Math.min(CAMERA_LIMITS.maxZoom, zoom));
}

export function zoomAtPoint(camera, factor, px, py) {
  const nextZoom = clampZoom(camera.zoom * factor);
  const zf = nextZoom / camera.zoom;
  return {
    zoom: nextZoom,
    x: px - (px - camera.x) * zf,
    y: py - (py - camera.y) * zf
  };
}

export function fitCameraToBbox(bbox, width, height) {
  const [[x0, y0], [x1, y1]] = bbox;
  const bw = Math.max(1, x1 - x0);
  const bh = Math.max(1, y1 - y0);
  const margin = 0.22;
  const zoom = clampZoom(Math.min(width * (1 - margin) / bw, height * (1 - margin) / bh));
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return { zoom, x: width / 2 - cx, y: height / 2 - cy };
}
