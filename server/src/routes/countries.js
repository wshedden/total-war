import { Router } from 'express';
import { getCountry, getCountryList } from '../services/countryStore.js';

const router = Router();

router.get('/', async (_req, res) => {
  const countries = await getCountryList();
  res.json(countries);
});

router.get('/:cca3', async (req, res) => {
  const country = await getCountry(req.params.cca3.toUpperCase());
  if (!country) {
    res.status(404).json({ error: 'Country not found' });
    return;
  }
  res.json(country);
});

export default router;
