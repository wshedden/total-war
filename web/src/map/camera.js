import { geoNaturalEarth1, geoPath } from 'd3-geo';

export const BASE_MAP_SCALE = 0.19;
export const CAMERA_LIMITS = { minZoom: 0.55, maxZoom: 7 };

function projectionForCamera(width, height, camera = { x: 0, y: 0, zoom: 1 }) {
  return geoNaturalEarth1()
    .translate([width / 2 + camera.x, height / 2 + camera.y])
    .scale(camera.zoom * Math.min(width, height) * BASE_MAP_SCALE);
}

function projectedSphereBounds(width, height, zoom) {
  const projection = projectionForCamera(width, height, { x: 0, y: 0, zoom });
  return geoPath(projection).bounds({ type: 'Sphere' });
}

function minZoomForViewport(width, height) {
  const [[x0, y0], [x1, y1]] = projectedSphereBounds(width, height, 1);
  const bw = Math.max(1, x1 - x0);
  const bh = Math.max(1, y1 - y0);
  const cover = 0.96;
  return Math.max(CAMERA_LIMITS.minZoom, (width * cover) / bw, (height * cover) / bh);
}

export function clampZoom(zoom, width = 0, height = 0) {
  const minZoom = width > 0 && height > 0 ? minZoomForViewport(width, height) : CAMERA_LIMITS.minZoom;
  return Math.max(minZoom, Math.min(CAMERA_LIMITS.maxZoom, zoom));
}

export function constrainCamera(camera, width, height) {
  const zoom = clampZoom(camera.zoom, width, height);
  const [[left0, top0], [right0, bottom0]] = projectedSphereBounds(width, height, zoom);
  const bw = right0 - left0;
  const bh = bottom0 - top0;
  const padX = Math.min(28, width * 0.04);
  const padY = Math.min(24, height * 0.04);

  let x = camera.x;
  let y = camera.y;

  if (bw <= width - padX * 2) {
    x = 0;
  } else {
    const minX = width - padX - right0;
    const maxX = padX - left0;
    x = Math.max(minX, Math.min(maxX, x));
  }

  if (bh <= height - padY * 2) {
    y = 0;
  } else {
    const minY = height - padY - bottom0;
    const maxY = padY - top0;
    y = Math.max(minY, Math.min(maxY, y));
  }

  return { zoom, x, y };
}

export function zoomAtPoint(camera, factor, px, py, width, height) {
  const nextZoom = clampZoom(camera.zoom * factor, width, height);
  const zf = nextZoom / camera.zoom;
  const next = {
    zoom: nextZoom,
    x: camera.x * zf + (1 - zf) * (px - width / 2),
    y: camera.y * zf + (1 - zf) * (py - height / 2)
  };
  return constrainCamera(next, width, height);
}

export function applyCameraTransform(ctx, camera, width, height) {
  ctx.translate(width / 2 + camera.x, height / 2 + camera.y);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-width / 2, -height / 2);
}

export function screenToWorld(camera, x, y, width, height) {
  return {
    x: width / 2 + (x - (width / 2 + camera.x)) / camera.zoom,
    y: height / 2 + (y - (height / 2 + camera.y)) / camera.zoom
  };
}

export function fitCameraToFeature(feature, width, height) {
  const padding = Math.min(width, height) * 0.16;
  const baseProjection = projectionForCamera(width, height, { x: 0, y: 0, zoom: 1 });
  const basePath = geoPath(baseProjection);
  const [[x0, y0], [x1, y1]] = basePath.bounds(feature);
  const bw = Math.max(1, x1 - x0);
  const bh = Math.max(1, y1 - y0);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;

  const targetZoom = clampZoom(Math.min((width - 2 * padding) / bw, (height - 2 * padding) / bh), width, height);
  const camera = {
    zoom: targetZoom,
    x: (width / 2 - cx) * targetZoom,
    y: (height / 2 - cy) * targetZoom
  };

  return constrainCamera(camera, width, height);
}
