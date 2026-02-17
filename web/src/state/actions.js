import { simulateTurn } from './store.js';

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
      store.setState((s) => ({ ...s, seed, turn: 0, events: [] }));
    },
    loadState(snapshot) {
      store.setState((s) => ({ ...s, ...snapshot }));
    }
  };
}
