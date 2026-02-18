import fs from 'node:fs/promises';
import path from 'node:path';
import { topology } from 'topojson-server';
import { feature } from 'topojson-client';
import { geoBounds } from 'd3-geo';
import { paths } from '../server/src/services/cachePaths.js';
import { fetchJson } from '../server/src/services/fetcher.js';
import { INDICATORS, fetchWorldBankLatest } from '../server/src/services/indicators.js';
import { loadOverrides, resolveCode } from '../server/src/services/reconcileCodes.js';
import { logger } from '../server/src/services/logger.js';
import { buildNeighbours } from './build-neighbours.js';

const args = new Set(process.argv.slice(2));
const doRefresh = args.has('--refresh');
const doBuildOnly = args.has('--build');

const bordersUrl = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
const restCountriesUrl = 'https://restcountries.com/v3.1/all?fields=cca3,name,population,region,subregion,capital,latlng,area,continents,flags';

async function ensureDirs() { await fs.mkdir(paths.raw, { recursive: true }); await fs.mkdir(paths.cache, { recursive: true }); }
const writeJson = (file, data) => fs.writeFile(file, JSON.stringify(data, null, 2));

async function loadWorldAtlasFallbackGeo() {
  const atlasPath = path.join(paths.root, 'node_modules', 'world-atlas', 'countries-110m.json');
  const topo = JSON.parse(await fs.readFile(atlasPath, 'utf8'));
  const geo = feature(topo, topo.objects.countries);
  geo.features.forEach((f, i) => {
    f.properties = {
      ADM0_A3: `C${String(i).padStart(3, '0')}`,
      ADMIN: `Country ${i + 1}`,
      ISO_A3: `C${String(i).padStart(3, '0')}`
    };
  });
  return geo;
}

async function fetchRaw() {
  logger.info('Fetching borders and country facts...');
  let borders;
  let countries = [];

  try { borders = await fetchJson(bordersUrl); } catch {
    logger.warn('Borders fetch unavailable; using bundled world-atlas fallback geometry.');
    borders = await loadWorldAtlasFallbackGeo();
  }
  try { countries = await fetchJson(restCountriesUrl); } catch {
    logger.warn('REST Countries fetch unavailable; using fallback sparse facts.');
  }

  await writeJson(path.join(paths.raw, 'borders.geo.json'), borders);
  await writeJson(path.join(paths.raw, 'restcountries.all.json'), countries);

  const wbData = {};
  for (const [key, id] of Object.entries(INDICATORS)) {
    try {
      const map = await fetchWorldBankLatest(id);
      wbData[key] = Object.fromEntries(map.entries());
    } catch {
      logger.warn(`Indicator fetch failed: ${key}; continuing with deterministic fallbacks.`);
      wbData[key] = {};
    }
  }
  await writeJson(path.join(paths.raw, 'worldbank.latest.json'), wbData);
}

const stableFallback = (basePop, factor) => Math.max(1, basePop * factor);

async function buildCache() {
  const overrides = await loadOverrides();
  const borders = JSON.parse(await fs.readFile(path.join(paths.raw, 'borders.geo.json'), 'utf8'));
  const countries = JSON.parse(await fs.readFile(path.join(paths.raw, 'restcountries.all.json'), 'utf8'));
  const wb = JSON.parse(await fs.readFile(path.join(paths.raw, 'worldbank.latest.json'), 'utf8'));

  const restByCode = new Map(countries.filter((c) => c.cca3).map((c) => [c.cca3, c]));
  const countryIndex = {};
  const worldFeatureCollection = { type: 'FeatureCollection', features: [] };

  for (const [idx, f] of (borders.features ?? []).entries()) {
    const props = f.properties ?? {};
    const rawCode = props.ADM0_A3 || props.ISO_A3 || props.SOV_A3 || `C${String(idx).padStart(3, '0')}`;
    if (rawCode === '-99') continue;
    const cca3 = resolveCode(rawCode, overrides);
    const rest = restByCode.get(cca3) ?? null;
    const name = rest?.name?.common ?? props.ADMIN ?? cca3;
    const population = wb.population?.[cca3]?.value ?? rest?.population ?? (200000 + idx * 13000);
    const gdp = wb.gdp?.[cca3]?.value ?? stableFallback(population, 12000);
    const gdpPerCapita = wb.gdpPerCapita?.[cca3]?.value ?? (population > 0 ? gdp / population : 0);
    const milPct = wb.militaryPercentGdp?.[cca3]?.value ?? 1.8;
    const bounds = geoBounds(f);

    f.properties = { cca3, name };
    worldFeatureCollection.features.push(f);
    countryIndex[cca3] = {
      cca3, name, officialName: rest?.name?.official ?? name,
      region: rest?.region ?? props.REGION_UN ?? '—', subregion: rest?.subregion ?? props.SUBREGION ?? '—',
      capitals: rest?.capital ?? [], areaKm2: rest?.area ?? null, population,
      indicators: { gdp, gdpPerCapita, population, militaryPercentGdp: milPct },
      bbox: bounds, latlng: rest?.latlng ?? null, flags: rest?.flags ?? null
    };
  }

  const topo = topology({ countries: worldFeatureCollection }, 1e5);
  await writeJson(paths.borders, topo);
  await writeJson(paths.countryIndex, countryIndex);
  await buildNeighbours();
  await writeJson(paths.meta, { version: '0.1.0', generatedAt: new Date().toISOString(), sources: { bordersUrl, restCountriesUrl, worldBank: INDICATORS } });
  logger.info(`Cache built: ${Object.keys(countryIndex).length} countries.`);
}

(async () => {
  await ensureDirs();
  if (doRefresh) await fetchRaw();
  if (doBuildOnly || doRefresh) return buildCache();
  logger.info('Usage: node scripts/data-refresh.js --refresh | --build');
})();
