import { logger } from './logger.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchJson(url, { retries = 3, backoffMs = 600 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'total-war-v0' } });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      logger.warn(`Fetch failed (${attempt}/${retries})`, url, error.message);
      if (attempt < retries) {
        await sleep(backoffMs * attempt);
      }
    }
  }
  throw lastError;
}
