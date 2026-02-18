# Total War v0 Prototype

A performant turn-based grand-strategy world map prototype (Node + browser, Canvas 2D).

## Requirements
- Node.js LTS (18+ recommended)

## Install and run
```bash
npm install
npm run data:refresh
npm run build
npm run dev
```
Open `http://localhost:3000`.

## Data workflow
- `npm run data:refresh` fetches Natural Earth borders, REST Countries, and World Bank indicators, then builds cache files.
- `npm run data:build` rebuilds cache from files already in `data/raw`.

## Keybinds
- `Space`: pause/unpause (disabled while typing)
- `Right Arrow`: advance one turn (disabled while typing)
- `Ctrl+F`: focus search
- `D`: toggle debug overlay
- `Escape`: close help modal

> Input-focus reminder: global keybinds are intentionally ignored while a text input is focused, so typing in search or numeric controls does not trigger turn controls.

## How diplomacy works
- Diplomacy is modelled on sparse neighbour edges with three primary meters: `rel`, `tension`, and `trust`.
- Each country has `influence`, a policy profile, and per-action cooldowns that gate diplomacy choices.
- On each turn, action planning selects one queued player action (if present) and up to one AI action per actor, then applies them in deterministic stable order.
- Actions can create persistent pacts/effects (guarantees, sanctions, trade buffs) that are tracked separately from base edge values and expire over future turns.
- After actions, the relationship simulation advances edge values, applies modifiers, and emits diplomacy events.

## Features in v1
- Canvas world map with Natural Earth projection (`geoNaturalEarth1`)
- Political overlay + data heatmap overlay
- Country hover tooltip and right-side dossier
- Deterministic seeded turn simulation
- Save/load via localStorage + JSON export/import
- Offline-fast startup after first data refresh
- Neighbour graph cache (`data/cache/neighbours.json`) built from TopoJSON adjacency
- Deterministic sparse relationship simulation per shared border (rel/tension/trust)
- Diplomacy overlay and dossier neighbour section with relation/tension meters
- Save/load includes compact relationship edge arrays
