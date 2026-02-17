import { fetchJson } from './fetcher.js';
import { logger } from './logger.js';

export const INDICATORS = {
  gdp: 'NY.GDP.MKTP.CD',
  gdpPerCapita: 'NY.GDP.PCAP.CD',
  population: 'SP.POP.TOTL',
  militaryPercentGdp: 'MS.MIL.XPND.GD.ZS'
};

export async function fetchWorldBankLatest(indicatorId) {
  const url = `https://api.worldbank.org/v2/country/all/indicator/${indicatorId}?format=json&per_page=20000`;
  const payload = await fetchJson(url, { retries: 3 });
  const rows = Array.isArray(payload) ? payload[1] : [];
  const latestByIso3 = new Map();

  for (const row of rows ?? []) {
    const iso3 = row?.countryiso3code;
    const value = row?.value;
    const year = Number(row?.date);
    if (!iso3 || iso3.length !== 3 || value == null || Number.isNaN(year)) continue;
    const prev = latestByIso3.get(iso3);
    if (!prev || year > prev.year) {
      latestByIso3.set(iso3, { year, value: Number(value) });
    }
  }

  logger.info(`World Bank indicator ${indicatorId}: ${latestByIso3.size} latest entries`);
  return latestByIso3;
}
