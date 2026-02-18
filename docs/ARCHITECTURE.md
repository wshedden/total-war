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
2. Rebuild projected `Path2D` and bounding boxes only when drawing (camera/state changes).
3. Draw fills then borders, then hover/selection outlines.
4. Use capped DPR (1.5) for crisp performance on modest hardware.

## Data flow
1. Raw fetch into `data/raw`.
2. Merge into canonical index keyed by `cca3`.
3. Build `borders.topo.json`, `countryIndex.json`, and `meta.json` in `data/cache`.
4. Runtime API serves cache only; static references are not embedded in save files.

## Turn pipeline (state simulation)
The turn step is deliberately staged to isolate concerns and keep updates reproducible:

1. **Policy stage**: iterate countries in sorted `cca3` order and apply policy-driven adjustments.
2. **Derived stats stage**: recompute `militarySpendAbs` and `power` from policy-updated values.
3. **Event/input stage**: roll deterministic per-country events and collect relation/economy inputs.
4. **Action planning stage**: build one queued player action (if any) plus one best AI action per actor.
5. **Action apply stage**: apply planned actions in stable order (`priority`, `actor`, `target`, `type`), update influence, cooldowns, and pact state.
6. **Relation effects stage**: age guarantees/sanctions/trade buffs and accumulate country growth deltas.
7. **Relationship simulation stage**: process bilateral edges, apply modifiers and event shocks, and classify posture.
8. **Final economy/influence stage**: apply growth deltas, update per-country outputs, and commit turn/event logs.

## Action planning and apply ordering
- Planning is read-only and proposes actions from the current turn snapshot.
- Application mutates a cloned next-state container after cooldown decrementing.
- A stable sort is used before application to remove ordering ambiguity when multiple actions touch related actors/edges.
- Preconditions are rechecked against the evolving next-state snapshot so invalidated actions fail safely and emit explicit events.

## Determinism rationale
Determinism is required for consistent save/load replay, debugging, and predictable balancing.

- One global seed is stored in game state.
- Per-country/per-turn randomness is channelled through `hash(seed, turn, cca3, channel) -> mulberry32`.
- Pair-level randomness for bilateral events uses canonical pair keys.
- Country and edge iteration use sorted/canonical orders rather than object insertion order.
- Planning and apply paths use explicit stable ordering, so equal input state always yields equal output state.
