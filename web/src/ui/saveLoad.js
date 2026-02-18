import { serializeRelations } from '../state/relationships.js';

const KEY = 'total-war-v0-save';

export function makeSnapshot(state) {
  return {
    seed: state.seed,
    turn: state.turn,
    paused: state.paused,
    speed: state.speed,
    camera: state.camera,
    selected: state.selected,
    overlay: state.overlay,
    metric: state.metric,
    dynamic: state.dynamic,
    events: state.events,
    postureByCountry: state.postureByCountry,
    relationsEdges: serializeRelations(state.relationEdges, state.relations)
  };
}

export function saveToLocal(snapshot) {
  localStorage.setItem(KEY, JSON.stringify(snapshot));
}

export function loadFromLocal() {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
}

export function exportJson(snapshot) {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `total-war-save-${Date.now()}.json`;
  a.click();
}

export function importJsonFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const text = await file.text();
      resolve(JSON.parse(text));
    };
    input.click();
  });
}
