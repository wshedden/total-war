import { simulateTurn, createInitialRelations, createInitialSimState, createInitialRelationEffects } from './store.js';
import { hydrateRelations } from './relationships.js';
import { clampPolicy, normalizeDynamicState } from './policies.js';
import { hydrateRelationEffectsState } from './relationEffects.js';
import { ACTION_DEFINITIONS, checkActionPreconditions } from './diplomaticActions.js';

export function createActions(store) {
  return {
    stepTurn() {
      store.setState((s) => simulateTurn(s));
    },
    togglePause() {
      store.setState((s) => ({ ...s, paused: !s.paused }));
    },
    setSpeed(speed) {
      store.setState((s) => ({ ...s, speed }));
    },
    setHover(cca3) {
      store.setState((s) => (s.hovered === cca3 ? s : { ...s, hovered: cca3 }));
    },
    selectCountry(cca3) {
      store.setState((s) => ({ ...s, selected: cca3, dossierOpen: true }));
    },
    setOverlay(overlay) {
      store.setState((s) => ({ ...s, overlay }));
    },
    setMetric(metric) {
      store.setState((s) => ({ ...s, metric }));
    },
    setCamera(camera) {
      store.setState((s) => ({ ...s, camera }));
    },
    toggleDebug() {
      store.setState((s) => ({ ...s, debug: !s.debug }));
    },
    setSearch(value) {
      store.setState((s) => ({ ...s, search: value }));
    },
    newGame(seed) {
      store.setState((s) => {
        const { relations, edges } = createInitialRelations(seed, s.neighbours, s.countryIndex);
        return {
          ...s,
          seed,
          turn: 0,
          events: [],
          dynamic: createInitialSimState(s.countryIndex),
          relations,
          relationEdges: edges,
          postureByCountry: {},
          relationEffects: createInitialRelationEffects(),
          queuedPlayerAction: null
        };
      });
    },
    setPolicyField(field, value, cca3 = null) {
      store.setState((s) => {
        const actor = cca3 ?? s.selected;
        if (!actor || !s.dynamic?.[actor]) return s;
        if (!['milTargetPct', 'growthFocus', 'stabilityFocus', 'stance'].includes(field)) return s;
        const entry = s.dynamic[actor];
        const nextPolicy = clampPolicy({
          ...(entry.policy ?? {}),
          [field]: value
        });
        return {
          ...s,
          dynamic: {
            ...s.dynamic,
            [actor]: {
              ...entry,
              policy: nextPolicy
            }
          }
        };
      });
    },
    queuePlayerDiplomaticAction(type, target, actor = null) {
      store.setState((s) => {
        const actionActor = actor ?? s.selected;
        if (!actionActor || !target || !ACTION_DEFINITIONS[type]) return s;
        const action = { actor: actionActor, target, type, source: 'player' };
        const check = checkActionPreconditions(s, action);
        if (!check.ok) return s;
        return { ...s, queuedPlayerAction: action };
      });
    },
    clearQueuedPlayerDiplomaticAction() {
      store.setState((s) => (s.queuedPlayerAction ? { ...s, queuedPlayerAction: null } : s));
    },
    loadState(snapshot) {
      store.setState((s) => {
        const hydrated = hydrateRelations(s.neighbours, snapshot.relationsEdges ?? []);
        return {
          ...s,
          ...snapshot,
          dynamic: normalizeDynamicState(snapshot.dynamic, s.countryIndex),
          relations: hydrated.relations,
          relationEdges: hydrated.edges,
          postureByCountry: snapshot.postureByCountry ?? {},
          relationEffects: hydrateRelationEffectsState(snapshot.relationEffects),
          queuedPlayerAction: snapshot.queuedPlayerAction ?? null
        };
      });
    }
  };
}
