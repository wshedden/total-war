# Data Sources

## Borders
- Natural Earth Admin-0 Countries (110m)
- URL: `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson`
- Licence: Natural Earth public domain terms

## Country facts
- REST Countries v3.1
- URL: `https://restcountries.com/v3.1/all`
- Licence: community open-data project (see upstream docs)

## Indicators
- World Bank Indicators API
- GDP: `NY.GDP.MKTP.CD`
- GDP per capita: `NY.GDP.PCAP.CD`
- Population: `SP.POP.TOTL`
- Military expenditure % GDP: `MS.MIL.XPND.GD.ZS`

Fetch timestamps and source metadata are written to `data/cache/meta.json` during refresh.
