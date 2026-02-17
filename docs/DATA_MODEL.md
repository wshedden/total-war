# Data Model

## Static country fields (`countryIndex`)
- `cca3`, `name`, `officialName`
- `region`, `subregion`, `capitals`
- `areaKm2`, `population`, `bbox`, `latlng`, `flags`
- `indicators`: `gdp`, `gdpPerCapita`, `population`, `militaryPercentGdp`

## Dynamic simulation fields (`state.dynamic[cca3]`)
- `gdp`: simulated GDP value
- `militaryPct`: military budget share (% GDP)
- `relations`: placeholder map for diplomacy evolution
- `growthMod`, `modTurns`: temporary modifier system
- `aiBias`: stable policy bias slider

## Save-state payload
- `seed`, `turn`, `paused`, `speed`
- `camera`, `selected`, `overlay`, `metric`
- `dynamic`, `events`
