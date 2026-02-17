# Architecture

## Modules overview
- `server/src/index.js`: Express entrypoint and route mounting.
- `server/src/routes/*`: API endpoints (`health`, `countries`, `borders`).
- `server/src/services/*`: cache paths, resilient fetcher, indicator fetches, stores, logging, and code reconciliation.
- `scripts/data-refresh.js`: fetch + merge + TopoJSON build pipeline.
- `web/src/state/*`: state store, actions, deterministic turn simulation.
- `web/src/map/*`: projection, camera, picking, style, and canvas renderer.
- `web/src/ui/*`: top bar, search, dossier, tooltip, overlays, debug, save/load helpers.

## Render flow
1. Load countries + borders once on startup.
2. Rebuild projected Path2D and bboxes only when drawing (camera/state changes).
3. Draw fills then borders, then hover/selection outlines.
4. Use capped DPR (1.5) for crisp performance on modest hardware.

## Data flow
1. Raw fetch into `data/raw`.
2. Merge into canonical index keyed by `cca3`.
3. Build `borders.topo.json`, `countryIndex.json`, and `meta.json` in `data/cache`.
4. Runtime API serves cache only; static references are not embedded in save files.

## Determinism strategy
- One global seed in game state.
- Per-country/per-turn randomness via hash(seed, turn, cca3, channel) -> mulberry32.
- Simulation does not rely on iteration-order side effects.
