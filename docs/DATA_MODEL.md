# Data Model

## Static country fields (`countryIndex`)
- `cca3`, `name`, `officialName`
- `region`, `subregion`, `capitals`
- `areaKm2`, `population`, `bbox`, `latlng`, `flags`
- `indicators`: `gdp`, `gdpPerCapita`, `population`, `militaryPercentGdp`

## Dynamic simulation fields (`state.dynamic[cca3]`)
- Core economy and military:
  - `gdp`: simulated GDP value
  - `militaryPct`: military budget share (% GDP)
  - `militarySpendAbs`: derived absolute military spending
  - `power`: derived strategic power score
- Policy and influence:
  - `influence`: spendable diplomatic influence resource (0–100)
  - `policy`: per-country policy object
    - `milTargetPct`: target military budget share
    - `growthFocus`: growth weighting (0–100)
    - `stabilityFocus`: stability weighting (0–100)
    - `stance`: diplomacy stance (`conciliatory`, `neutral`, `hardline`)
- Turn modifiers and derived state:
  - `relations`: adjacency map of bilateral edge stats
  - `growthMod`, `modTurns`: temporary modifier system
  - `growthRate`, `stability`: economic and domestic stability outputs
  - `aiBias`: stable policy bias slider
- Diplomatic action tracking:
  - `actionUsedTurn`: turn marker for one-action-per-turn enforcement
  - `cooldowns`: remaining turns by action type (`improveRelations`, `offerTradeDeal`, `threaten`, `guarantee`, `sanction`)

## Bilateral diplomacy state
- `state.relations[a][b]` (symmetric edge body):
  - `rel`, `tension`, `trust`
  - `lastTurnUpdated`
  - `modifiers`: timed additive edge modifiers
- `state.relationEdges`: canonical sparse edge list (`[a, b]`) used for deterministic traversal and serialisation

## Pact and edge-extra state
- `state.relationEffects` stores persistent pact/effect containers keyed by canonical edge key (`A|B`):
  - `guaranteesByEdge`: active guarantee pacts with actor/target and `expiryTurn`
  - `sanctionsByEdge`: active sanction entries with expiry and growth penalties
  - `tradeByEdge`: trade-level state and optional temporary buff expiry
- Save payload can include sparse edge extras (`edgeExtras`) for non-core per-edge metadata without inflating every relationship row.

## Save-state payload
- Runtime/meta:
  - `seed`, `turn`, `paused`, `speed`
  - `camera`, `selected`, `overlay`, `metric`
- Simulation:
  - `dynamic`, `events`
  - `relations` (serialised edges) and/or `relationEdges`
  - `pacts` / `relationEffects` (guarantees, sanctions, trade)
  - `edgeExtras` (optional sparse edge metadata)
