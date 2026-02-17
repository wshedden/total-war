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

## Features in v0
- Canvas world map with Natural Earth projection (`geoNaturalEarth1`)
- Political overlay + data heatmap overlay
- Country hover tooltip and right-side dossier
- Deterministic seeded turn simulation
- Save/load via localStorage + JSON export/import
- Offline-fast startup after first data refresh
