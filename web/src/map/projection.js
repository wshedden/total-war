import { geoNaturalEarth1, geoPath } from 'd3-geo';

export function createProjection(width, height, camera) {
  const projection = geoNaturalEarth1()
    .translate([width / 2 + camera.x, height / 2 + camera.y])
    .scale(camera.zoom * Math.min(width, height) * 0.19);
  const path = geoPath(projection);
  return { projection, path };
}
