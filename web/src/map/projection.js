import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { BASE_MAP_SCALE } from './camera.js';

export function createProjection(width, height) {
  const projection = geoNaturalEarth1()
    .translate([width / 2, height / 2])
    .scale(Math.min(width, height) * BASE_MAP_SCALE);
  const path = geoPath(projection);
  return { projection, path };
}
