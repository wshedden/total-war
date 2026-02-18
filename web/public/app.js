// web/src/util/dom.js
var el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};
function isTypingTarget(target = document.activeElement) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

// web/src/ui/layout.js
function buildLayout(root2) {
  const app = el("div", "app");
  const topbar = el("div", "topbar");
  const main = el("div", "main");
  const mapWrap = el("div", "map-wrap");
  const canvas = el("canvas");
  canvas.id = "mapCanvas";
  const tooltip = el("div", "tooltip");
  tooltip.hidden = true;
  const legend = el("div", "legend");
  legend.hidden = true;
  const debug = el("div", "debug");
  debug.hidden = true;
  const dossier = el("aside", "dossier");
  mapWrap.append(canvas, tooltip, legend, debug);
  main.append(mapWrap, dossier);
  app.append(topbar, main);
  root2.append(app);
  return { app, topbar, main, mapWrap, canvas, tooltip, legend, debug, dossier };
}

// web/src/ui/topbar.js
function renderTopbar(container, actions2) {
  const search = el("input");
  search.placeholder = "Search country\u2026";
  search.id = "countrySearch";
  const pause = el("button", "", "Pause");
  const step = el("button", "", "Step");
  const speed = el("select");
  ["1", "2", "4"].forEach((s) => {
    const o = el("option");
    o.value = s;
    o.textContent = `x${s}`;
    speed.append(o);
  });
  const overlay = el("select");
  overlay.innerHTML = '<option value="political">Political</option><option value="diplomacy">Diplomacy</option><option value="heatmap">Data Heatmap</option>';
  const metric = el("select");
  metric.innerHTML = '<option value="gdp">GDP</option><option value="gdpPerCapita">GDP per capita</option><option value="population">Population</option><option value="militaryPercentGdp">Military % GDP</option>';
  const save = el("button", "", "Save");
  const load = el("button", "", "Load");
  const exportBtn = el("button", "", "Export");
  const importBtn = el("button", "", "Import");
  const newGame = el("button", "", "New Game");
  const help = el("button", "", "Help");
  pause.onclick = () => actions2.togglePause();
  step.onclick = () => actions2.stepTurn();
  speed.onchange = () => actions2.setSpeed(Number(speed.value));
  overlay.onchange = () => actions2.setOverlay(overlay.value);
  metric.onchange = () => actions2.setMetric(metric.value);
  container.append(search, pause, step, speed, overlay, metric, save, load, exportBtn, importBtn, newGame, help);
  return { search, pause, step, speed, overlay, metric, save, load, exportBtn, importBtn, newGame, help };
}

// web/src/ui/search.js
function wireSearch(input, countries2, actions2) {
  input.addEventListener("input", () => actions2.setSearch(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const q = input.value.trim().toLowerCase();
    const match = countries2.find((c) => c.name.toLowerCase().includes(q) || c.cca3.toLowerCase() === q);
    if (match) actions2.selectCountry(match.cca3);
  });
}

// web/src/util/format.js
var compact = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 2 });
var num = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
var fmtCompact = (value) => Number.isFinite(value) ? compact.format(value) : "\u2014";
var fmtPercent = (value) => Number.isFinite(value) ? `${num.format(value)}%` : "\u2014";

// web/src/state/influence.js
var TURN_INFLUENCE_CONFIG = {
  baseGain: 1,
  stabilityGain: 1,
  topGdpGain: 1,
  stabilityThreshold: 0.7,
  topGdpPercentile: 0.15,
  maxInfluence: 50
};
function rankCountriesByGdp(dynamic) {
  return Object.entries(dynamic).map(([cca3, entry]) => ({ cca3, gdp: entry?.gdp ?? 0 })).sort((a, b) => b.gdp - a.gdp || a.cca3.localeCompare(b.cca3));
}
function buildTopGdpCountrySet(dynamic, percentile = TURN_INFLUENCE_CONFIG.topGdpPercentile) {
  const ranking = rankCountriesByGdp(dynamic);
  const count = Math.max(1, Math.ceil(ranking.length * percentile));
  return new Set(ranking.slice(0, count).map((item) => item.cca3));
}
function computeInfluenceGain(entry, isTopGdpCountry, config = TURN_INFLUENCE_CONFIG) {
  let gain = config.baseGain;
  if ((entry?.stability ?? 0) >= config.stabilityThreshold) gain += config.stabilityGain;
  if (isTopGdpCountry) gain += config.topGdpGain;
  return gain;
}
function applyInfluenceGain(entry, gain, maxInfluence = TURN_INFLUENCE_CONFIG.maxInfluence) {
  const influence = Math.max(0, entry?.influence ?? 0);
  return Math.min(maxInfluence, influence + gain);
}

// web/src/state/selectors.js
function selectNextTurnGainHint(state, cca3, config = TURN_INFLUENCE_CONFIG) {
  const entry = state?.dynamic?.[cca3];
  if (!entry) return null;
  const topGdpCountries = buildTopGdpCountrySet(state.dynamic, config.topGdpPercentile);
  const inTopGdpPercentile = topGdpCountries.has(cca3);
  const gain = computeInfluenceGain(entry, inTopGdpPercentile, config);
  const nextInfluence = applyInfluenceGain(entry, gain, config.maxInfluence);
  return {
    gain,
    nextInfluence,
    maxInfluence: config.maxInfluence,
    reasons: {
      base: true,
      stability: (entry.stability ?? 0) >= config.stabilityThreshold,
      topGdpPercentile: inTopGdpPercentile
    }
  };
}

// web/src/ui/dossier.js
function relLabel(rel, tension) {
  if (rel <= -40 || tension >= 70) return "Hostile";
  if (rel >= 40 && tension < 40) return "Friendly";
  return "Wary";
}
function relBar(rel) {
  const pct = (rel + 100) / 200 * 100;
  return `<div class="rel-bar" title="Relationship -100 to 100"><i style="width:${pct.toFixed(1)}%"></i></div>`;
}
function tensionBar(tension) {
  return `<div class="tense-bar" title="Border tension 0 to 100"><i style="width:${tension}%"></i></div>`;
}
function sortNeighbours(selected, state, mode) {
  const items = (state.neighbours?.[selected.cca3] ?? []).map((code) => {
    const edge = state.relations?.[selected.cca3]?.[code] ?? { rel: 0, tension: 0, trust: 50 };
    return {
      code,
      name: state.countryIndex?.[code]?.name ?? code,
      rel: edge.rel,
      tension: edge.tension,
      trust: edge.trust,
      powerRatio: (state.dynamic?.[selected.cca3]?.power ?? 0) / Math.max(1, state.dynamic?.[code]?.power ?? 0)
    };
  });
  if (mode === "name") items.sort((a, b) => a.name.localeCompare(b.name));
  else items.sort((a, b) => a.rel - b.rel || b.tension - a.tension || a.code.localeCompare(b.code));
  return items;
}
function renderDossier(node, state) {
  const selected = state.selected ? state.countryIndex[state.selected] : null;
  if (!selected) {
    const markup2 = "<h2>Country dossier</h2><p>Select a country to inspect key indicators.</p>";
    if (node.__lastMarkup !== markup2) {
      node.innerHTML = markup2;
      node.__lastMarkup = markup2;
    }
    return;
  }
  if (!node.__sortMode) node.__sortMode = "negative";
  const neighbours2 = sortNeighbours(selected, state, node.__sortMode);
  const dyn = state.dynamic[selected.cca3];
  const influenceHint = selectNextTurnGainHint(state, selected.cca3);
  const influenceHintText = influenceHint ? `+${influenceHint.gain} next turn (${influenceHint.reasons.base ? "base" : ""}${influenceHint.reasons.stability ? ", stability" : ""}${influenceHint.reasons.topGdpPercentile ? ", top GDP" : ""})` : "N/A";
  const markup = `
    <h2>${selected.name}</h2>
    <p>${selected.officialName}</p>
    <div class="metric"><span>Code</span><strong>${selected.cca3}</strong></div>
    <div class="metric"><span>Region</span><strong>${selected.region}</strong></div>
    <div class="metric"><span>Population</span><strong>${fmtCompact(selected.population)}</strong></div>
    <div class="metric"><span>GDP (sim)</span><strong>${fmtCompact(dyn.gdp)}</strong></div>
    <div class="metric"><span>Military % GDP</span><strong>${fmtPercent(dyn.militaryPct)}</strong></div>
    <div class="metric"><span>Stability</span><strong>${fmtPercent(dyn.stability)}</strong></div>
    <div class="metric"><span>Influence</span><strong>${fmtCompact(dyn.influence)}</strong></div>
    <div class="metric" title="Projected influence gain next turn."><span>Influence gain hint</span><strong>${influenceHintText}</strong></div>
    <div class="metric"><span>Power</span><strong>${fmtCompact(dyn.power)}</strong></div>
    <h3>Neighbours</h3>
    <div class="neighbour-head"><span>Sorted by ${node.__sortMode === "name" ? "name" : "worst relations"}</span><button class="neighbour-sort" type="button">Toggle sort</button></div>
    <div class="neighbours">${neighbours2.map((n) => `
      <div class="neighbour-row" title="Relationship and tension are deterministic border metrics.">
        <div class="neighbour-title"><strong>${n.code}</strong> ${n.name}</div>
        ${relBar(n.rel)}
        ${tensionBar(n.tension)}
        <div class="neighbour-meta"><span>${relLabel(n.rel, n.tension)}</span><span>Rel ${n.rel}</span><span>Tension ${n.tension}</span><span>Power ${n.powerRatio.toFixed(2)}x</span></div>
      </div>
    `).join("") || '<div class="events">No land neighbours in this dataset.</div>'}</div>
    <h3>Recent events</h3>
    <div class="events">${state.events.filter((e) => e.cca3 === selected.cca3 || e.secondary === selected.cca3).slice(0, 8).map((e) => `<div>T${e.turn}: ${e.text}${e.secondary ? ` (${e.cca3} \u2194 ${e.secondary})` : ""}</div>`).join("") || "<div>None.</div>"}</div>
  `;
  if (node.__lastMarkup !== markup) {
    node.innerHTML = markup;
    node.__lastMarkup = markup;
    const sortBtn = node.querySelector(".neighbour-sort");
    if (sortBtn) {
      sortBtn.onclick = () => {
        node.__sortMode = node.__sortMode === "name" ? "negative" : "name";
        node.__lastMarkup = "";
      };
    }
  }
  node.classList.toggle("open", state.dossierOpen);
}

// web/src/ui/tooltip.js
function renderTooltip(node, state, x, y) {
  if (!state.hovered) {
    node.hidden = true;
    return;
  }
  const c = state.countryIndex[state.hovered];
  const d = state.dynamic[state.hovered];
  const markup = `<strong>${c?.name ?? state.hovered}</strong><div>Pop: ${fmtCompact(c?.population)}</div><div>GDP: ${fmtCompact(d?.gdp)}</div>`;
  node.hidden = false;
  node.style.left = `${x + 14}px`;
  node.style.top = `${y + 14}px`;
  if (node.__lastMarkup !== markup) {
    node.innerHTML = markup;
    node.__lastMarkup = markup;
  }
}

// web/src/state/metricRange.js
function getActiveMetricValue(metric, dynamicEntry, country) {
  if (metric === "militaryPercentGdp") return dynamicEntry?.militaryPct;
  if (metric === "gdp") return dynamicEntry?.gdp;
  return country?.indicators?.[metric];
}
var memoKey = "";
var memoDynamic = null;
var memoCountryIndex = null;
var memoRange = { min: 0, max: 1 };
function selectActiveMetricRange(state) {
  const key = `${state.metric}:${state.turn}`;
  if (memoKey === key && memoDynamic === state.dynamic && memoCountryIndex === state.countryIndex) {
    return memoRange;
  }
  const values = Object.keys(state.dynamic).map((cca3) => getActiveMetricValue(state.metric, state.dynamic[cca3], state.countryIndex[cca3])).filter(Number.isFinite);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  memoKey = key;
  memoDynamic = state.dynamic;
  memoCountryIndex = state.countryIndex;
  memoRange = { min, max };
  return memoRange;
}
function selectActiveMetricValue(state, cca3) {
  return getActiveMetricValue(state.metric, state.dynamic[cca3], state.countryIndex[cca3]);
}

// web/src/ui/overlays.js
function renderLegend(node, state) {
  if (state.overlay === "heatmap") {
    node.hidden = false;
    const { min, max } = selectActiveMetricRange(state);
    const markup = `<div><strong>${state.metric}</strong></div><div>${fmtCompact(min)} \u2192 ${fmtCompact(max)}</div>`;
    if (node.__lastMarkup !== markup) {
      node.innerHTML = markup;
      node.__lastMarkup = markup;
    }
    return;
  }
  if (state.overlay === "diplomacy") {
    node.hidden = false;
    const markup = state.selected ? "<div><strong>Diplomacy</strong></div><div>Green: positive \xB7 Gray: neutral \xB7 Red: negative</div><div>Stroke intensity = border tension</div>" : "<div><strong>Diplomacy</strong></div><div>Select a country to view neighbour relations.</div>";
    if (node.__lastMarkup !== markup) {
      node.innerHTML = markup;
      node.__lastMarkup = markup;
    }
    return;
  }
  node.hidden = true;
}

// web/src/ui/debug.js
function renderDebug(node, state) {
  node.hidden = !state.debug;
  if (!state.debug) return;
  const markup = `FPS ${state.debugInfo.fps}<br/>Turn ${state.turn}<br/>Hover ${state.hovered ?? "\u2014"}<br/>Candidates ${state.debugInfo.candidates}<br/>Render ${state.debugInfo.renderMs.toFixed(2)} ms`;
  if (node.__lastMarkup !== markup) {
    node.innerHTML = markup;
    node.__lastMarkup = markup;
  }
}

// web/src/util/rng.js
function hashString(input) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a += 1831565813;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function countryTurnRng(globalSeed, turn, cca3, channel = "base") {
  const seed = hashString(`${globalSeed}:${turn}:${cca3}:${channel}`);
  return mulberry32(seed);
}
function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// web/src/state/relationships.js
var REL_MIN = -100;
var REL_MAX = 100;
var METER_MIN = 0;
var METER_MAX = 100;
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function toSortedEdge(a, b) {
  return a < b ? [a, b] : [b, a];
}
function createStableEdges(neighbours2 = {}) {
  const edges = [];
  for (const a of Object.keys(neighbours2).sort()) {
    for (const b of [...neighbours2[a] ?? []].sort()) {
      if (a < b) edges.push([a, b]);
    }
  }
  edges.sort((x, y) => pairKey(x[0], x[1]).localeCompare(pairKey(y[0], y[1])));
  return edges;
}
function getNeighbours(cca3, neighbours2 = {}) {
  return neighbours2?.[cca3] ?? [];
}
function getEdge(relations, a, b) {
  const [x, y] = toSortedEdge(a, b);
  return relations?.[x]?.[y] ?? null;
}
function setEdge(relations, a, b, edge) {
  const [x, y] = toSortedEdge(a, b);
  if (!relations[x]) relations[x] = {};
  if (!relations[y]) relations[y] = {};
  const frozen = {
    rel: clamp(Math.round(edge.rel), REL_MIN, REL_MAX),
    tension: clamp(Math.round(edge.tension), METER_MIN, METER_MAX),
    trust: clamp(Math.round(edge.trust), METER_MIN, METER_MAX),
    lastTurnUpdated: edge.lastTurnUpdated ?? 0,
    modifiers: (edge.modifiers ?? []).map((m) => ({
      rel: Math.round(m.rel ?? 0),
      tension: Math.round(m.tension ?? 0),
      trust: Math.round(m.trust ?? 0),
      turns: Math.max(0, Math.round(m.turns ?? 0)),
      text: m.text ?? ""
    }))
  };
  relations[x][y] = frozen;
  relations[y][x] = frozen;
}
function gaussianish(rng) {
  return (rng() + rng() + rng()) / 3;
}
function withRegionBias(rel, a, b, countryIndex2) {
  const same = countryIndex2?.[a]?.region && countryIndex2?.[a]?.region === countryIndex2?.[b]?.region;
  return same ? rel + 5 : rel;
}
function initRelations(seed, neighbours2, countryIndex2) {
  const relations = {};
  const edges = createStableEdges(neighbours2);
  for (const [a, b] of edges) {
    const rand = mulberry32(hashString(`pair:${seed}:${pairKey(a, b)}`));
    const relNoise = Math.round((gaussianish(rand) - 0.5) * 60);
    const rel = clamp(withRegionBias(relNoise, a, b, countryIndex2), -30, 30);
    const tension = 5 + Math.floor(rand() * 16);
    const trust = 40 + Math.floor(rand() * 21);
    setEdge(relations, a, b, { rel, tension, trust, lastTurnUpdated: 0, modifiers: [] });
  }
  return { relations, edges };
}
function edgeModifierTotals(edge) {
  let rel = 0;
  let tension = 0;
  let trust = 0;
  const nextModifiers = [];
  for (const mod of edge.modifiers ?? []) {
    rel += mod.rel ?? 0;
    tension += mod.tension ?? 0;
    trust += mod.trust ?? 0;
    if ((mod.turns ?? 0) > 1) nextModifiers.push({ ...mod, turns: mod.turns - 1 });
  }
  return { rel, tension, trust, nextModifiers };
}
function classifyPosture(edge) {
  if (edge.rel <= -40 || edge.tension >= 70) return "Hostile";
  if (edge.rel >= -20 && edge.rel <= 39 || edge.tension >= 40 && edge.tension <= 69) return "Wary";
  return edge.rel >= 40 && edge.tension < 40 ? "Friendly" : "Wary";
}
function stepRelations({ turn, seed, relations, edges, dynamic, events, relationInputsByCountry = {} }) {
  const nextRelations = {};
  const postureByCountry = {};
  const nextEvents = [];
  const eventsByCountry = /* @__PURE__ */ new Map();
  for (const evt of events) {
    if (!evt?.cca3) continue;
    if (!eventsByCountry.has(evt.cca3)) eventsByCountry.set(evt.cca3, []);
    eventsByCountry.get(evt.cca3).push(evt);
  }
  for (const [a, b] of edges) {
    const prev = getEdge(relations, a, b) ?? { rel: 0, tension: 10, trust: 50, lastTurnUpdated: 0, modifiers: [] };
    const powerA = dynamic[a]?.power ?? 0;
    const powerB = dynamic[b]?.power ?? 0;
    const denom = Math.max(powerA, powerB, 1);
    const imbalance = (powerA - powerB) / denom;
    const mod = edgeModifierTotals(prev);
    let rel = prev.rel + clamp(Math.round((0 - prev.rel) * 0.02), -1, 1);
    let tension = prev.tension;
    let trust = prev.trust;
    const hostileNear = (eventsByCountry.get(a) ?? []).some((e) => e.text?.toLowerCase().includes("shock")) || (eventsByCountry.get(b) ?? []).some((e) => e.text?.toLowerCase().includes("shock"));
    let tensionDelta = 0 + (rel < 0 ? 1 : -1) + (Math.abs(imbalance) > 0.35 ? 1 : 0) + (trust < 35 ? 1 : 0) + (tension > 80 ? 1 : 0) + (hostileNear ? 1 : 0);
    let relDelta = 0 + (tension > 75 ? -1 : 0) + (tension < 20 && trust > 60 ? 1 : 0);
    let trustDelta = 0 + (rel > 25 && tension < 35 ? 1 : 0) - (tension > 70 ? 1 : 0) - (rel < -35 ? 1 : 0);
    const inputA = relationInputsByCountry[a] ?? {};
    const inputB = relationInputsByCountry[b] ?? {};
    relDelta += (inputA.relDelta ?? 0) + (inputB.relDelta ?? 0);
    tensionDelta += (inputA.tensionDelta ?? 0) + (inputB.tensionDelta ?? 0);
    trustDelta += (inputA.trustDelta ?? 0) + (inputB.trustDelta ?? 0);
    const pairRand = mulberry32(hashString(`evt:${seed}:${turn}:${pairKey(a, b)}`));
    const roll = pairRand();
    let evt = null;
    if (roll < 25e-4) {
      evt = { turn, cca3: a, secondary: b, text: "Border Incident" };
      rel -= 10;
      tension += 15;
      mod.nextModifiers.push({ rel: -1, tension: 2, trust: -1, turns: 3, text: "Border Incident aftermath" });
    } else if (roll < 5e-3) {
      evt = { turn, cca3: a, secondary: b, text: "Trade Deal" };
      rel += 10;
      tension -= 10;
      trust += 5;
      mod.nextModifiers.push({ rel: 1, tension: -1, trust: 1, turns: 3, text: "Trade momentum" });
    } else if (roll < 7e-3) {
      evt = { turn, cca3: a, secondary: b, text: "Sanctions" };
      rel -= 15;
      tension += 10;
      mod.nextModifiers.push({ rel: -1, tension: 1, trust: -1, turns: 2, text: "Sanctions pressure" });
    } else if (roll < 9e-3) {
      evt = { turn, cca3: a, secondary: b, text: "Joint Exercise" };
      rel += 5;
      trust += 10;
      mod.nextModifiers.push({ rel: 1, tension: -1, trust: 1, turns: 3, text: "Joint exercise confidence" });
    }
    if (evt) nextEvents.push(evt);
    rel += relDelta + mod.rel;
    tension += tensionDelta + mod.tension;
    trust += trustDelta + mod.trust;
    const edge = {
      rel: clamp(rel, REL_MIN, REL_MAX),
      tension: clamp(tension, METER_MIN, METER_MAX),
      trust: clamp(trust, METER_MIN, METER_MAX),
      lastTurnUpdated: turn,
      modifiers: mod.nextModifiers
    };
    setEdge(nextRelations, a, b, edge);
    const posture = classifyPosture(edge);
    if (!postureByCountry[a]) postureByCountry[a] = {};
    if (!postureByCountry[b]) postureByCountry[b] = {};
    postureByCountry[a][b] = posture;
    postureByCountry[b][a] = posture;
  }
  return { relations: nextRelations, postureByCountry, relationEvents: nextEvents };
}
function serializeRelations(edges, relations) {
  const relationEdges = [];
  for (const [a, b] of edges) {
    const edge = getEdge(relations, a, b);
    if (!edge) continue;
    relationEdges.push([a, b, edge.rel, edge.tension, edge.trust, edge.modifiers ?? []]);
  }
  return relationEdges;
}
function hydrateRelations(neighbours2, relationEdges = []) {
  const relations = {};
  const edges = createStableEdges(neighbours2);
  for (const row of relationEdges) {
    const [a, b, rel, tension, trust, modifiers = []] = row;
    if (!a || !b) continue;
    setEdge(relations, a, b, { rel, tension, trust, modifiers, lastTurnUpdated: 0 });
  }
  return { relations, edges };
}

// web/src/ui/saveLoad.js
var KEY = "total-war-v0-save";
function makeSnapshot(state) {
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
function saveToLocal(snapshot) {
  localStorage.setItem(KEY, JSON.stringify(snapshot));
}
function loadFromLocal() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function exportJson(snapshot) {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `total-war-save-${Date.now()}.json`;
  a.click();
}
function importJsonFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const text = await file.text();
      try {
        resolve(JSON.parse(text));
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
}

// web/src/state/store.js
function clamp2(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
var POLICY_MILITARY_MIN_PCT = 0.2;
var POLICY_MILITARY_MAX_PCT = 12;
var POLICY_MILITARY_MAX_DELTA_PER_TURN = 0.2;
var POLICY_GROWTH_MOD_MIN = -0.02;
var POLICY_GROWTH_MOD_MAX = 0.02;
var POLICY_STABILITY_DELTA_MIN = -0.03;
var POLICY_STABILITY_DELTA_MAX = 0.03;
var STANCE_POLICY_EFFECTS = {
  hardline: { growth: -15e-4, stability: -2e-3, trustDelta: -1 },
  balanced: { growth: 0, stability: 0, trustDelta: 0 },
  conciliatory: { growth: 15e-4, stability: 2e-3, trustDelta: 1 }
};
function getPolicy(entry) {
  const policy = entry.policy ?? {};
  return {
    milTargetPct: clamp2(policy.milTargetPct ?? entry.militaryPct ?? 2.5, POLICY_MILITARY_MIN_PCT, POLICY_MILITARY_MAX_PCT),
    growthFocus: clamp2(policy.growthFocus ?? 0.5, 0, 1),
    stabilityFocus: clamp2(policy.stabilityFocus ?? 0.5, 0, 1),
    stance: STANCE_POLICY_EFFECTS[policy.stance] ? policy.stance : "balanced"
  };
}
function computePower(gdp, militaryPct, population) {
  const milAbs = Math.max(0, gdp * (militaryPct / 100));
  return Math.sqrt(milAbs) * 0.6 + Math.sqrt(Math.max(0, gdp)) * 0.3 + Math.sqrt(Math.max(0, population)) * 0.1;
}
function createStore(initialState) {
  let state = initialState;
  const listeners = /* @__PURE__ */ new Set();
  return {
    getState: () => state,
    setState(update) {
      state = typeof update === "function" ? update(state) : { ...state, ...update };
      listeners.forEach((fn) => fn(state));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
}
function createInitialSimState(countryIndex2) {
  const dynamic = {};
  Object.values(countryIndex2).forEach((country) => {
    const gdp = country.indicators.gdp;
    const militaryPct = country.indicators.militaryPercentGdp;
    const militarySpendAbs = gdp * (militaryPct / 100);
    dynamic[country.cca3] = {
      gdp,
      militaryPct,
      policy: {
        milTargetPct: clamp2(militaryPct, POLICY_MILITARY_MIN_PCT, POLICY_MILITARY_MAX_PCT),
        growthFocus: 0.5,
        stabilityFocus: 0.5,
        stance: "balanced"
      },
      relations: {},
      growthMod: 0,
      modTurns: 0,
      aiBias: 0.5,
      growthRate: 0.01,
      stability: 0.55,
      influence: 0,
      militarySpendAbs,
      power: computePower(gdp, militaryPct, country.population ?? country.indicators.population ?? 0)
    };
  });
  return dynamic;
}
function createInitialRelations(seed, neighbours2, countryIndex2) {
  return initRelations(seed, neighbours2, countryIndex2);
}
function simulateTurn(state) {
  const nextTurn = state.turn + 1;
  const nextDynamic = {};
  const events = [];
  const relationInputsByCountry = {};
  for (const [cca3, entry] of Object.entries(state.dynamic)) {
    const country = state.countryIndex[cca3];
    const rng = countryTurnRng(state.seed, nextTurn, cca3, "sim");
    const drift = (rng() - 0.5) * 0.012;
    const eventRoll = rng();
    let growthMod = entry.modTurns > 0 ? entry.growthMod : 0;
    let modTurns = Math.max(0, entry.modTurns - 1);
    const policy = getPolicy(entry);
    const stanceEffects = STANCE_POLICY_EFFECTS[policy.stance];
    if (eventRoll < 0.012) {
      growthMod = rng() < 0.5 ? -0.018 : 0.02;
      modTurns = 3 + Math.floor(rng() * 4);
      events.push({ turn: nextTurn, cca3, text: growthMod > 0 ? "Investment boom" : "Economic shock" });
    }
    const growthPolicyMod = clamp2(
      (policy.growthFocus - 0.5) * 0.01 + (0.5 - policy.stabilityFocus) * 4e-3 + stanceEffects.growth,
      POLICY_GROWTH_MOD_MIN,
      POLICY_GROWTH_MOD_MAX
    );
    const stabilityPolicyDelta = clamp2(
      (policy.stabilityFocus - 0.5) * 0.03 - (policy.growthFocus - 0.5) * 0.012 + stanceEffects.stability,
      POLICY_STABILITY_DELTA_MIN,
      POLICY_STABILITY_DELTA_MAX
    );
    const militaryDelta = clamp2(
      policy.milTargetPct - entry.militaryPct,
      -POLICY_MILITARY_MAX_DELTA_PER_TURN,
      POLICY_MILITARY_MAX_DELTA_PER_TURN
    );
    const growth = 0.01 + drift + growthMod + growthPolicyMod;
    const gdp = Math.max(1, entry.gdp * (1 + growth));
    const aiBias = entry.aiBias;
    const militaryPct = clamp2(entry.militaryPct + militaryDelta, POLICY_MILITARY_MIN_PCT, POLICY_MILITARY_MAX_PCT);
    const stability = clamp2((entry.stability ?? 0.55) + stabilityPolicyDelta, 0, 1);
    const militarySpendAbs = gdp * (militaryPct / 100);
    const power = computePower(gdp, militaryPct, country?.population ?? 0);
    relationInputsByCountry[cca3] = {
      trustDelta: stanceEffects.trustDelta
    };
    nextDynamic[cca3] = {
      ...entry,
      gdp,
      militaryPct,
      aiBias,
      growthMod,
      modTurns,
      policy,
      growthRate: growth,
      stability,
      militarySpendAbs,
      power
    };
  }
  const relStep = stepRelations({
    turn: nextTurn,
    seed: state.seed,
    relations: state.relations,
    edges: state.relationEdges,
    dynamic: nextDynamic,
    relationInputsByCountry,
    events
  });
  for (const cca3 of Object.keys(nextDynamic)) {
    const postures = Object.values(relStep.postureByCountry[cca3] ?? {});
    const hostile = postures.filter((p) => p === "Hostile").length;
    if (!postures.length) continue;
    const hostilityRate = hostile / postures.length;
    nextDynamic[cca3].militaryPct = clamp2(
      nextDynamic[cca3].militaryPct + hostilityRate * 0.08,
      POLICY_MILITARY_MIN_PCT,
      POLICY_MILITARY_MAX_PCT
    );
    nextDynamic[cca3].militarySpendAbs = nextDynamic[cca3].gdp * (nextDynamic[cca3].militaryPct / 100);
    nextDynamic[cca3].power = computePower(nextDynamic[cca3].gdp, nextDynamic[cca3].militaryPct, state.countryIndex[cca3]?.population ?? 0);
  }
  const topGdpCountries = buildTopGdpCountrySet(nextDynamic, TURN_INFLUENCE_CONFIG.topGdpPercentile);
  for (const [cca3, entry] of Object.entries(nextDynamic)) {
    const gain = computeInfluenceGain(entry, topGdpCountries.has(cca3), TURN_INFLUENCE_CONFIG);
    nextDynamic[cca3].influence = applyInfluenceGain(entry, gain, TURN_INFLUENCE_CONFIG.maxInfluence);
  }
  return {
    ...state,
    turn: nextTurn,
    dynamic: nextDynamic,
    relations: relStep.relations,
    postureByCountry: relStep.postureByCountry,
    events: [...relStep.relationEvents, ...events, ...state.events].slice(0, 80)
  };
}

// web/src/state/actions.js
function createActions(store2) {
  return {
    stepTurn() {
      store2.setState((s) => simulateTurn(s));
    },
    togglePause() {
      store2.setState((s) => ({ ...s, paused: !s.paused }));
    },
    setSpeed(speed) {
      store2.setState((s) => ({ ...s, speed }));
    },
    setHover(cca3) {
      store2.setState((s) => s.hovered === cca3 ? s : { ...s, hovered: cca3 });
    },
    selectCountry(cca3) {
      store2.setState((s) => ({ ...s, selected: cca3, dossierOpen: true }));
    },
    setOverlay(overlay) {
      store2.setState((s) => ({ ...s, overlay }));
    },
    setMetric(metric) {
      store2.setState((s) => ({ ...s, metric }));
    },
    setCamera(camera) {
      store2.setState((s) => ({ ...s, camera }));
    },
    toggleDebug() {
      store2.setState((s) => ({ ...s, debug: !s.debug }));
    },
    setSearch(value) {
      store2.setState((s) => ({ ...s, search: value }));
    },
    newGame(seed) {
      store2.setState((s) => {
        const { relations, edges } = createInitialRelations(seed, s.neighbours, s.countryIndex);
        return {
          ...s,
          seed,
          turn: 0,
          events: [],
          dynamic: createInitialSimState(s.countryIndex),
          relations,
          relationEdges: edges,
          postureByCountry: {}
        };
      });
    },
    loadState(snapshot) {
      store2.setState((s) => {
        const hydrated = hydrateRelations(s.neighbours, snapshot.relationsEdges ?? []);
        return {
          ...s,
          ...snapshot,
          relations: hydrated.relations,
          relationEdges: hydrated.edges,
          postureByCountry: snapshot.postureByCountry ?? {}
        };
      });
    }
  };
}

// node_modules/topojson-client/src/identity.js
function identity_default(x) {
  return x;
}

// node_modules/topojson-client/src/transform.js
function transform_default(transform) {
  if (transform == null) return identity_default;
  var x05, y05, kx = transform.scale[0], ky = transform.scale[1], dx = transform.translate[0], dy = transform.translate[1];
  return function(input, i) {
    if (!i) x05 = y05 = 0;
    var j = 2, n = input.length, output = new Array(n);
    output[0] = (x05 += input[0]) * kx + dx;
    output[1] = (y05 += input[1]) * ky + dy;
    while (j < n) output[j] = input[j], ++j;
    return output;
  };
}

// node_modules/topojson-client/src/reverse.js
function reverse_default(array, n) {
  var t, j = array.length, i = j - n;
  while (i < --j) t = array[i], array[i++] = array[j], array[j] = t;
}

// node_modules/topojson-client/src/feature.js
function feature_default(topology, o) {
  if (typeof o === "string") o = topology.objects[o];
  return o.type === "GeometryCollection" ? { type: "FeatureCollection", features: o.geometries.map(function(o2) {
    return feature(topology, o2);
  }) } : feature(topology, o);
}
function feature(topology, o) {
  var id = o.id, bbox = o.bbox, properties = o.properties == null ? {} : o.properties, geometry = object(topology, o);
  return id == null && bbox == null ? { type: "Feature", properties, geometry } : bbox == null ? { type: "Feature", id, properties, geometry } : { type: "Feature", id, bbox, properties, geometry };
}
function object(topology, o) {
  var transformPoint = transform_default(topology.transform), arcs = topology.arcs;
  function arc(i, points) {
    if (points.length) points.pop();
    for (var a = arcs[i < 0 ? ~i : i], k = 0, n = a.length; k < n; ++k) {
      points.push(transformPoint(a[k], k));
    }
    if (i < 0) reverse_default(points, n);
  }
  function point(p) {
    return transformPoint(p);
  }
  function line(arcs2) {
    var points = [];
    for (var i = 0, n = arcs2.length; i < n; ++i) arc(arcs2[i], points);
    if (points.length < 2) points.push(points[0]);
    return points;
  }
  function ring(arcs2) {
    var points = line(arcs2);
    while (points.length < 4) points.push(points[0]);
    return points;
  }
  function polygon(arcs2) {
    return arcs2.map(ring);
  }
  function geometry(o2) {
    var type = o2.type, coordinates;
    switch (type) {
      case "GeometryCollection":
        return { type, geometries: o2.geometries.map(geometry) };
      case "Point":
        coordinates = point(o2.coordinates);
        break;
      case "MultiPoint":
        coordinates = o2.coordinates.map(point);
        break;
      case "LineString":
        coordinates = line(o2.arcs);
        break;
      case "MultiLineString":
        coordinates = o2.arcs.map(line);
        break;
      case "Polygon":
        coordinates = polygon(o2.arcs);
        break;
      case "MultiPolygon":
        coordinates = o2.arcs.map(polygon);
        break;
      default:
        return null;
    }
    return { type, coordinates };
  }
  return geometry(o);
}

// node_modules/d3-array/src/fsum.js
var Adder = class {
  constructor() {
    this._partials = new Float64Array(32);
    this._n = 0;
  }
  add(x) {
    const p = this._partials;
    let i = 0;
    for (let j = 0; j < this._n && j < 32; j++) {
      const y = p[j], hi = x + y, lo = Math.abs(x) < Math.abs(y) ? x - (hi - y) : y - (hi - x);
      if (lo) p[i++] = lo;
      x = hi;
    }
    p[i] = x;
    this._n = i + 1;
    return this;
  }
  valueOf() {
    const p = this._partials;
    let n = this._n, x, y, lo, hi = 0;
    if (n > 0) {
      hi = p[--n];
      while (n > 0) {
        x = hi;
        y = p[--n];
        hi = x + y;
        lo = y - (hi - x);
        if (lo) break;
      }
      if (n > 0 && (lo < 0 && p[n - 1] < 0 || lo > 0 && p[n - 1] > 0)) {
        y = lo * 2;
        x = hi + y;
        if (y == x - hi) hi = x;
      }
    }
    return hi;
  }
};

// node_modules/d3-array/src/merge.js
function* flatten(arrays) {
  for (const array of arrays) {
    yield* array;
  }
}
function merge(arrays) {
  return Array.from(flatten(arrays));
}

// node_modules/d3-geo/src/math.js
var epsilon = 1e-6;
var epsilon2 = 1e-12;
var pi = Math.PI;
var halfPi = pi / 2;
var quarterPi = pi / 4;
var tau = pi * 2;
var degrees = 180 / pi;
var radians = pi / 180;
var abs = Math.abs;
var atan = Math.atan;
var atan2 = Math.atan2;
var cos = Math.cos;
var sin = Math.sin;
var sign = Math.sign || function(x) {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
};
var sqrt = Math.sqrt;
function acos(x) {
  return x > 1 ? 0 : x < -1 ? pi : Math.acos(x);
}
function asin(x) {
  return x > 1 ? halfPi : x < -1 ? -halfPi : Math.asin(x);
}

// node_modules/d3-geo/src/noop.js
function noop() {
}

// node_modules/d3-geo/src/stream.js
function streamGeometry(geometry, stream) {
  if (geometry && streamGeometryType.hasOwnProperty(geometry.type)) {
    streamGeometryType[geometry.type](geometry, stream);
  }
}
var streamObjectType = {
  Feature: function(object2, stream) {
    streamGeometry(object2.geometry, stream);
  },
  FeatureCollection: function(object2, stream) {
    var features = object2.features, i = -1, n = features.length;
    while (++i < n) streamGeometry(features[i].geometry, stream);
  }
};
var streamGeometryType = {
  Sphere: function(object2, stream) {
    stream.sphere();
  },
  Point: function(object2, stream) {
    object2 = object2.coordinates;
    stream.point(object2[0], object2[1], object2[2]);
  },
  MultiPoint: function(object2, stream) {
    var coordinates = object2.coordinates, i = -1, n = coordinates.length;
    while (++i < n) object2 = coordinates[i], stream.point(object2[0], object2[1], object2[2]);
  },
  LineString: function(object2, stream) {
    streamLine(object2.coordinates, stream, 0);
  },
  MultiLineString: function(object2, stream) {
    var coordinates = object2.coordinates, i = -1, n = coordinates.length;
    while (++i < n) streamLine(coordinates[i], stream, 0);
  },
  Polygon: function(object2, stream) {
    streamPolygon(object2.coordinates, stream);
  },
  MultiPolygon: function(object2, stream) {
    var coordinates = object2.coordinates, i = -1, n = coordinates.length;
    while (++i < n) streamPolygon(coordinates[i], stream);
  },
  GeometryCollection: function(object2, stream) {
    var geometries = object2.geometries, i = -1, n = geometries.length;
    while (++i < n) streamGeometry(geometries[i], stream);
  }
};
function streamLine(coordinates, stream, closed) {
  var i = -1, n = coordinates.length - closed, coordinate;
  stream.lineStart();
  while (++i < n) coordinate = coordinates[i], stream.point(coordinate[0], coordinate[1], coordinate[2]);
  stream.lineEnd();
}
function streamPolygon(coordinates, stream) {
  var i = -1, n = coordinates.length;
  stream.polygonStart();
  while (++i < n) streamLine(coordinates[i], stream, 1);
  stream.polygonEnd();
}
function stream_default(object2, stream) {
  if (object2 && streamObjectType.hasOwnProperty(object2.type)) {
    streamObjectType[object2.type](object2, stream);
  } else {
    streamGeometry(object2, stream);
  }
}

// node_modules/d3-geo/src/cartesian.js
function spherical(cartesian2) {
  return [atan2(cartesian2[1], cartesian2[0]), asin(cartesian2[2])];
}
function cartesian(spherical2) {
  var lambda = spherical2[0], phi = spherical2[1], cosPhi = cos(phi);
  return [cosPhi * cos(lambda), cosPhi * sin(lambda), sin(phi)];
}
function cartesianDot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cartesianCross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function cartesianAddInPlace(a, b) {
  a[0] += b[0], a[1] += b[1], a[2] += b[2];
}
function cartesianScale(vector, k) {
  return [vector[0] * k, vector[1] * k, vector[2] * k];
}
function cartesianNormalizeInPlace(d) {
  var l = sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
  d[0] /= l, d[1] /= l, d[2] /= l;
}

// node_modules/d3-geo/src/compose.js
function compose_default(a, b) {
  function compose(x, y) {
    return x = a(x, y), b(x[0], x[1]);
  }
  if (a.invert && b.invert) compose.invert = function(x, y) {
    return x = b.invert(x, y), x && a.invert(x[0], x[1]);
  };
  return compose;
}

// node_modules/d3-geo/src/rotation.js
function rotationIdentity(lambda, phi) {
  if (abs(lambda) > pi) lambda -= Math.round(lambda / tau) * tau;
  return [lambda, phi];
}
rotationIdentity.invert = rotationIdentity;
function rotateRadians(deltaLambda, deltaPhi, deltaGamma) {
  return (deltaLambda %= tau) ? deltaPhi || deltaGamma ? compose_default(rotationLambda(deltaLambda), rotationPhiGamma(deltaPhi, deltaGamma)) : rotationLambda(deltaLambda) : deltaPhi || deltaGamma ? rotationPhiGamma(deltaPhi, deltaGamma) : rotationIdentity;
}
function forwardRotationLambda(deltaLambda) {
  return function(lambda, phi) {
    lambda += deltaLambda;
    if (abs(lambda) > pi) lambda -= Math.round(lambda / tau) * tau;
    return [lambda, phi];
  };
}
function rotationLambda(deltaLambda) {
  var rotation = forwardRotationLambda(deltaLambda);
  rotation.invert = forwardRotationLambda(-deltaLambda);
  return rotation;
}
function rotationPhiGamma(deltaPhi, deltaGamma) {
  var cosDeltaPhi = cos(deltaPhi), sinDeltaPhi = sin(deltaPhi), cosDeltaGamma = cos(deltaGamma), sinDeltaGamma = sin(deltaGamma);
  function rotation(lambda, phi) {
    var cosPhi = cos(phi), x = cos(lambda) * cosPhi, y = sin(lambda) * cosPhi, z = sin(phi), k = z * cosDeltaPhi + x * sinDeltaPhi;
    return [
      atan2(y * cosDeltaGamma - k * sinDeltaGamma, x * cosDeltaPhi - z * sinDeltaPhi),
      asin(k * cosDeltaGamma + y * sinDeltaGamma)
    ];
  }
  rotation.invert = function(lambda, phi) {
    var cosPhi = cos(phi), x = cos(lambda) * cosPhi, y = sin(lambda) * cosPhi, z = sin(phi), k = z * cosDeltaGamma - y * sinDeltaGamma;
    return [
      atan2(y * cosDeltaGamma + z * sinDeltaGamma, x * cosDeltaPhi + k * sinDeltaPhi),
      asin(k * cosDeltaPhi - x * sinDeltaPhi)
    ];
  };
  return rotation;
}

// node_modules/d3-geo/src/circle.js
function circleStream(stream, radius, delta, direction, t0, t1) {
  if (!delta) return;
  var cosRadius = cos(radius), sinRadius = sin(radius), step = direction * delta;
  if (t0 == null) {
    t0 = radius + direction * tau;
    t1 = radius - step / 2;
  } else {
    t0 = circleRadius(cosRadius, t0);
    t1 = circleRadius(cosRadius, t1);
    if (direction > 0 ? t0 < t1 : t0 > t1) t0 += direction * tau;
  }
  for (var point, t = t0; direction > 0 ? t > t1 : t < t1; t -= step) {
    point = spherical([cosRadius, -sinRadius * cos(t), -sinRadius * sin(t)]);
    stream.point(point[0], point[1]);
  }
}
function circleRadius(cosRadius, point) {
  point = cartesian(point), point[0] -= cosRadius;
  cartesianNormalizeInPlace(point);
  var radius = acos(-point[1]);
  return ((-point[2] < 0 ? -radius : radius) + tau - epsilon) % tau;
}

// node_modules/d3-geo/src/clip/buffer.js
function buffer_default() {
  var lines = [], line;
  return {
    point: function(x, y, m) {
      line.push([x, y, m]);
    },
    lineStart: function() {
      lines.push(line = []);
    },
    lineEnd: noop,
    rejoin: function() {
      if (lines.length > 1) lines.push(lines.pop().concat(lines.shift()));
    },
    result: function() {
      var result = lines;
      lines = [];
      line = null;
      return result;
    }
  };
}

// node_modules/d3-geo/src/pointEqual.js
function pointEqual_default(a, b) {
  return abs(a[0] - b[0]) < epsilon && abs(a[1] - b[1]) < epsilon;
}

// node_modules/d3-geo/src/clip/rejoin.js
function Intersection(point, points, other, entry) {
  this.x = point;
  this.z = points;
  this.o = other;
  this.e = entry;
  this.v = false;
  this.n = this.p = null;
}
function rejoin_default(segments, compareIntersection2, startInside, interpolate, stream) {
  var subject = [], clip = [], i, n;
  segments.forEach(function(segment) {
    if ((n2 = segment.length - 1) <= 0) return;
    var n2, p0 = segment[0], p1 = segment[n2], x;
    if (pointEqual_default(p0, p1)) {
      if (!p0[2] && !p1[2]) {
        stream.lineStart();
        for (i = 0; i < n2; ++i) stream.point((p0 = segment[i])[0], p0[1]);
        stream.lineEnd();
        return;
      }
      p1[0] += 2 * epsilon;
    }
    subject.push(x = new Intersection(p0, segment, null, true));
    clip.push(x.o = new Intersection(p0, null, x, false));
    subject.push(x = new Intersection(p1, segment, null, false));
    clip.push(x.o = new Intersection(p1, null, x, true));
  });
  if (!subject.length) return;
  clip.sort(compareIntersection2);
  link(subject);
  link(clip);
  for (i = 0, n = clip.length; i < n; ++i) {
    clip[i].e = startInside = !startInside;
  }
  var start = subject[0], points, point;
  while (1) {
    var current = start, isSubject = true;
    while (current.v) if ((current = current.n) === start) return;
    points = current.z;
    stream.lineStart();
    do {
      current.v = current.o.v = true;
      if (current.e) {
        if (isSubject) {
          for (i = 0, n = points.length; i < n; ++i) stream.point((point = points[i])[0], point[1]);
        } else {
          interpolate(current.x, current.n.x, 1, stream);
        }
        current = current.n;
      } else {
        if (isSubject) {
          points = current.p.z;
          for (i = points.length - 1; i >= 0; --i) stream.point((point = points[i])[0], point[1]);
        } else {
          interpolate(current.x, current.p.x, -1, stream);
        }
        current = current.p;
      }
      current = current.o;
      points = current.z;
      isSubject = !isSubject;
    } while (!current.v);
    stream.lineEnd();
  }
}
function link(array) {
  if (!(n = array.length)) return;
  var n, i = 0, a = array[0], b;
  while (++i < n) {
    a.n = b = array[i];
    b.p = a;
    a = b;
  }
  a.n = b = array[0];
  b.p = a;
}

// node_modules/d3-geo/src/polygonContains.js
function longitude(point) {
  return abs(point[0]) <= pi ? point[0] : sign(point[0]) * ((abs(point[0]) + pi) % tau - pi);
}
function polygonContains_default(polygon, point) {
  var lambda = longitude(point), phi = point[1], sinPhi = sin(phi), normal = [sin(lambda), -cos(lambda), 0], angle = 0, winding = 0;
  var sum = new Adder();
  if (sinPhi === 1) phi = halfPi + epsilon;
  else if (sinPhi === -1) phi = -halfPi - epsilon;
  for (var i = 0, n = polygon.length; i < n; ++i) {
    if (!(m = (ring = polygon[i]).length)) continue;
    var ring, m, point0 = ring[m - 1], lambda0 = longitude(point0), phi0 = point0[1] / 2 + quarterPi, sinPhi0 = sin(phi0), cosPhi0 = cos(phi0);
    for (var j = 0; j < m; ++j, lambda0 = lambda1, sinPhi0 = sinPhi1, cosPhi0 = cosPhi1, point0 = point1) {
      var point1 = ring[j], lambda1 = longitude(point1), phi1 = point1[1] / 2 + quarterPi, sinPhi1 = sin(phi1), cosPhi1 = cos(phi1), delta = lambda1 - lambda0, sign2 = delta >= 0 ? 1 : -1, absDelta = sign2 * delta, antimeridian = absDelta > pi, k = sinPhi0 * sinPhi1;
      sum.add(atan2(k * sign2 * sin(absDelta), cosPhi0 * cosPhi1 + k * cos(absDelta)));
      angle += antimeridian ? delta + sign2 * tau : delta;
      if (antimeridian ^ lambda0 >= lambda ^ lambda1 >= lambda) {
        var arc = cartesianCross(cartesian(point0), cartesian(point1));
        cartesianNormalizeInPlace(arc);
        var intersection = cartesianCross(normal, arc);
        cartesianNormalizeInPlace(intersection);
        var phiArc = (antimeridian ^ delta >= 0 ? -1 : 1) * asin(intersection[2]);
        if (phi > phiArc || phi === phiArc && (arc[0] || arc[1])) {
          winding += antimeridian ^ delta >= 0 ? 1 : -1;
        }
      }
    }
  }
  return (angle < -epsilon || angle < epsilon && sum < -epsilon2) ^ winding & 1;
}

// node_modules/d3-geo/src/clip/index.js
function clip_default(pointVisible, clipLine, interpolate, start) {
  return function(sink) {
    var line = clipLine(sink), ringBuffer = buffer_default(), ringSink = clipLine(ringBuffer), polygonStarted = false, polygon, segments, ring;
    var clip = {
      point,
      lineStart,
      lineEnd,
      polygonStart: function() {
        clip.point = pointRing;
        clip.lineStart = ringStart;
        clip.lineEnd = ringEnd;
        segments = [];
        polygon = [];
      },
      polygonEnd: function() {
        clip.point = point;
        clip.lineStart = lineStart;
        clip.lineEnd = lineEnd;
        segments = merge(segments);
        var startInside = polygonContains_default(polygon, start);
        if (segments.length) {
          if (!polygonStarted) sink.polygonStart(), polygonStarted = true;
          rejoin_default(segments, compareIntersection, startInside, interpolate, sink);
        } else if (startInside) {
          if (!polygonStarted) sink.polygonStart(), polygonStarted = true;
          sink.lineStart();
          interpolate(null, null, 1, sink);
          sink.lineEnd();
        }
        if (polygonStarted) sink.polygonEnd(), polygonStarted = false;
        segments = polygon = null;
      },
      sphere: function() {
        sink.polygonStart();
        sink.lineStart();
        interpolate(null, null, 1, sink);
        sink.lineEnd();
        sink.polygonEnd();
      }
    };
    function point(lambda, phi) {
      if (pointVisible(lambda, phi)) sink.point(lambda, phi);
    }
    function pointLine(lambda, phi) {
      line.point(lambda, phi);
    }
    function lineStart() {
      clip.point = pointLine;
      line.lineStart();
    }
    function lineEnd() {
      clip.point = point;
      line.lineEnd();
    }
    function pointRing(lambda, phi) {
      ring.push([lambda, phi]);
      ringSink.point(lambda, phi);
    }
    function ringStart() {
      ringSink.lineStart();
      ring = [];
    }
    function ringEnd() {
      pointRing(ring[0][0], ring[0][1]);
      ringSink.lineEnd();
      var clean = ringSink.clean(), ringSegments = ringBuffer.result(), i, n = ringSegments.length, m, segment, point2;
      ring.pop();
      polygon.push(ring);
      ring = null;
      if (!n) return;
      if (clean & 1) {
        segment = ringSegments[0];
        if ((m = segment.length - 1) > 0) {
          if (!polygonStarted) sink.polygonStart(), polygonStarted = true;
          sink.lineStart();
          for (i = 0; i < m; ++i) sink.point((point2 = segment[i])[0], point2[1]);
          sink.lineEnd();
        }
        return;
      }
      if (n > 1 && clean & 2) ringSegments.push(ringSegments.pop().concat(ringSegments.shift()));
      segments.push(ringSegments.filter(validSegment));
    }
    return clip;
  };
}
function validSegment(segment) {
  return segment.length > 1;
}
function compareIntersection(a, b) {
  return ((a = a.x)[0] < 0 ? a[1] - halfPi - epsilon : halfPi - a[1]) - ((b = b.x)[0] < 0 ? b[1] - halfPi - epsilon : halfPi - b[1]);
}

// node_modules/d3-geo/src/clip/antimeridian.js
var antimeridian_default = clip_default(
  function() {
    return true;
  },
  clipAntimeridianLine,
  clipAntimeridianInterpolate,
  [-pi, -halfPi]
);
function clipAntimeridianLine(stream) {
  var lambda0 = NaN, phi0 = NaN, sign0 = NaN, clean;
  return {
    lineStart: function() {
      stream.lineStart();
      clean = 1;
    },
    point: function(lambda1, phi1) {
      var sign1 = lambda1 > 0 ? pi : -pi, delta = abs(lambda1 - lambda0);
      if (abs(delta - pi) < epsilon) {
        stream.point(lambda0, phi0 = (phi0 + phi1) / 2 > 0 ? halfPi : -halfPi);
        stream.point(sign0, phi0);
        stream.lineEnd();
        stream.lineStart();
        stream.point(sign1, phi0);
        stream.point(lambda1, phi0);
        clean = 0;
      } else if (sign0 !== sign1 && delta >= pi) {
        if (abs(lambda0 - sign0) < epsilon) lambda0 -= sign0 * epsilon;
        if (abs(lambda1 - sign1) < epsilon) lambda1 -= sign1 * epsilon;
        phi0 = clipAntimeridianIntersect(lambda0, phi0, lambda1, phi1);
        stream.point(sign0, phi0);
        stream.lineEnd();
        stream.lineStart();
        stream.point(sign1, phi0);
        clean = 0;
      }
      stream.point(lambda0 = lambda1, phi0 = phi1);
      sign0 = sign1;
    },
    lineEnd: function() {
      stream.lineEnd();
      lambda0 = phi0 = NaN;
    },
    clean: function() {
      return 2 - clean;
    }
  };
}
function clipAntimeridianIntersect(lambda0, phi0, lambda1, phi1) {
  var cosPhi0, cosPhi1, sinLambda0Lambda1 = sin(lambda0 - lambda1);
  return abs(sinLambda0Lambda1) > epsilon ? atan((sin(phi0) * (cosPhi1 = cos(phi1)) * sin(lambda1) - sin(phi1) * (cosPhi0 = cos(phi0)) * sin(lambda0)) / (cosPhi0 * cosPhi1 * sinLambda0Lambda1)) : (phi0 + phi1) / 2;
}
function clipAntimeridianInterpolate(from, to, direction, stream) {
  var phi;
  if (from == null) {
    phi = direction * halfPi;
    stream.point(-pi, phi);
    stream.point(0, phi);
    stream.point(pi, phi);
    stream.point(pi, 0);
    stream.point(pi, -phi);
    stream.point(0, -phi);
    stream.point(-pi, -phi);
    stream.point(-pi, 0);
    stream.point(-pi, phi);
  } else if (abs(from[0] - to[0]) > epsilon) {
    var lambda = from[0] < to[0] ? pi : -pi;
    phi = direction * lambda / 2;
    stream.point(-lambda, phi);
    stream.point(0, phi);
    stream.point(lambda, phi);
  } else {
    stream.point(to[0], to[1]);
  }
}

// node_modules/d3-geo/src/clip/circle.js
function circle_default(radius) {
  var cr = cos(radius), delta = 2 * radians, smallRadius = cr > 0, notHemisphere = abs(cr) > epsilon;
  function interpolate(from, to, direction, stream) {
    circleStream(stream, radius, delta, direction, from, to);
  }
  function visible(lambda, phi) {
    return cos(lambda) * cos(phi) > cr;
  }
  function clipLine(stream) {
    var point0, c0, v0, v00, clean;
    return {
      lineStart: function() {
        v00 = v0 = false;
        clean = 1;
      },
      point: function(lambda, phi) {
        var point1 = [lambda, phi], point2, v = visible(lambda, phi), c = smallRadius ? v ? 0 : code(lambda, phi) : v ? code(lambda + (lambda < 0 ? pi : -pi), phi) : 0;
        if (!point0 && (v00 = v0 = v)) stream.lineStart();
        if (v !== v0) {
          point2 = intersect(point0, point1);
          if (!point2 || pointEqual_default(point0, point2) || pointEqual_default(point1, point2))
            point1[2] = 1;
        }
        if (v !== v0) {
          clean = 0;
          if (v) {
            stream.lineStart();
            point2 = intersect(point1, point0);
            stream.point(point2[0], point2[1]);
          } else {
            point2 = intersect(point0, point1);
            stream.point(point2[0], point2[1], 2);
            stream.lineEnd();
          }
          point0 = point2;
        } else if (notHemisphere && point0 && smallRadius ^ v) {
          var t;
          if (!(c & c0) && (t = intersect(point1, point0, true))) {
            clean = 0;
            if (smallRadius) {
              stream.lineStart();
              stream.point(t[0][0], t[0][1]);
              stream.point(t[1][0], t[1][1]);
              stream.lineEnd();
            } else {
              stream.point(t[1][0], t[1][1]);
              stream.lineEnd();
              stream.lineStart();
              stream.point(t[0][0], t[0][1], 3);
            }
          }
        }
        if (v && (!point0 || !pointEqual_default(point0, point1))) {
          stream.point(point1[0], point1[1]);
        }
        point0 = point1, v0 = v, c0 = c;
      },
      lineEnd: function() {
        if (v0) stream.lineEnd();
        point0 = null;
      },
      // Rejoin first and last segments if there were intersections and the first
      // and last points were visible.
      clean: function() {
        return clean | (v00 && v0) << 1;
      }
    };
  }
  function intersect(a, b, two) {
    var pa = cartesian(a), pb = cartesian(b);
    var n1 = [1, 0, 0], n2 = cartesianCross(pa, pb), n2n2 = cartesianDot(n2, n2), n1n2 = n2[0], determinant = n2n2 - n1n2 * n1n2;
    if (!determinant) return !two && a;
    var c1 = cr * n2n2 / determinant, c2 = -cr * n1n2 / determinant, n1xn2 = cartesianCross(n1, n2), A = cartesianScale(n1, c1), B = cartesianScale(n2, c2);
    cartesianAddInPlace(A, B);
    var u = n1xn2, w = cartesianDot(A, u), uu = cartesianDot(u, u), t2 = w * w - uu * (cartesianDot(A, A) - 1);
    if (t2 < 0) return;
    var t = sqrt(t2), q = cartesianScale(u, (-w - t) / uu);
    cartesianAddInPlace(q, A);
    q = spherical(q);
    if (!two) return q;
    var lambda0 = a[0], lambda1 = b[0], phi0 = a[1], phi1 = b[1], z;
    if (lambda1 < lambda0) z = lambda0, lambda0 = lambda1, lambda1 = z;
    var delta2 = lambda1 - lambda0, polar = abs(delta2 - pi) < epsilon, meridian = polar || delta2 < epsilon;
    if (!polar && phi1 < phi0) z = phi0, phi0 = phi1, phi1 = z;
    if (meridian ? polar ? phi0 + phi1 > 0 ^ q[1] < (abs(q[0] - lambda0) < epsilon ? phi0 : phi1) : phi0 <= q[1] && q[1] <= phi1 : delta2 > pi ^ (lambda0 <= q[0] && q[0] <= lambda1)) {
      var q1 = cartesianScale(u, (-w + t) / uu);
      cartesianAddInPlace(q1, A);
      return [q, spherical(q1)];
    }
  }
  function code(lambda, phi) {
    var r = smallRadius ? radius : pi - radius, code2 = 0;
    if (lambda < -r) code2 |= 1;
    else if (lambda > r) code2 |= 2;
    if (phi < -r) code2 |= 4;
    else if (phi > r) code2 |= 8;
    return code2;
  }
  return clip_default(visible, clipLine, interpolate, smallRadius ? [0, -radius] : [-pi, radius - pi]);
}

// node_modules/d3-geo/src/clip/line.js
function line_default(a, b, x05, y05, x12, y12) {
  var ax = a[0], ay = a[1], bx = b[0], by = b[1], t0 = 0, t1 = 1, dx = bx - ax, dy = by - ay, r;
  r = x05 - ax;
  if (!dx && r > 0) return;
  r /= dx;
  if (dx < 0) {
    if (r < t0) return;
    if (r < t1) t1 = r;
  } else if (dx > 0) {
    if (r > t1) return;
    if (r > t0) t0 = r;
  }
  r = x12 - ax;
  if (!dx && r < 0) return;
  r /= dx;
  if (dx < 0) {
    if (r > t1) return;
    if (r > t0) t0 = r;
  } else if (dx > 0) {
    if (r < t0) return;
    if (r < t1) t1 = r;
  }
  r = y05 - ay;
  if (!dy && r > 0) return;
  r /= dy;
  if (dy < 0) {
    if (r < t0) return;
    if (r < t1) t1 = r;
  } else if (dy > 0) {
    if (r > t1) return;
    if (r > t0) t0 = r;
  }
  r = y12 - ay;
  if (!dy && r < 0) return;
  r /= dy;
  if (dy < 0) {
    if (r > t1) return;
    if (r > t0) t0 = r;
  } else if (dy > 0) {
    if (r < t0) return;
    if (r < t1) t1 = r;
  }
  if (t0 > 0) a[0] = ax + t0 * dx, a[1] = ay + t0 * dy;
  if (t1 < 1) b[0] = ax + t1 * dx, b[1] = ay + t1 * dy;
  return true;
}

// node_modules/d3-geo/src/clip/rectangle.js
var clipMax = 1e9;
var clipMin = -clipMax;
function clipRectangle(x05, y05, x12, y12) {
  function visible(x, y) {
    return x05 <= x && x <= x12 && y05 <= y && y <= y12;
  }
  function interpolate(from, to, direction, stream) {
    var a = 0, a1 = 0;
    if (from == null || (a = corner(from, direction)) !== (a1 = corner(to, direction)) || comparePoint(from, to) < 0 ^ direction > 0) {
      do
        stream.point(a === 0 || a === 3 ? x05 : x12, a > 1 ? y12 : y05);
      while ((a = (a + direction + 4) % 4) !== a1);
    } else {
      stream.point(to[0], to[1]);
    }
  }
  function corner(p, direction) {
    return abs(p[0] - x05) < epsilon ? direction > 0 ? 0 : 3 : abs(p[0] - x12) < epsilon ? direction > 0 ? 2 : 1 : abs(p[1] - y05) < epsilon ? direction > 0 ? 1 : 0 : direction > 0 ? 3 : 2;
  }
  function compareIntersection2(a, b) {
    return comparePoint(a.x, b.x);
  }
  function comparePoint(a, b) {
    var ca = corner(a, 1), cb = corner(b, 1);
    return ca !== cb ? ca - cb : ca === 0 ? b[1] - a[1] : ca === 1 ? a[0] - b[0] : ca === 2 ? a[1] - b[1] : b[0] - a[0];
  }
  return function(stream) {
    var activeStream = stream, bufferStream = buffer_default(), segments, polygon, ring, x__, y__, v__, x_, y_, v_, first, clean;
    var clipStream = {
      point,
      lineStart,
      lineEnd,
      polygonStart,
      polygonEnd
    };
    function point(x, y) {
      if (visible(x, y)) activeStream.point(x, y);
    }
    function polygonInside() {
      var winding = 0;
      for (var i = 0, n = polygon.length; i < n; ++i) {
        for (var ring2 = polygon[i], j = 1, m = ring2.length, point2 = ring2[0], a0, a1, b0 = point2[0], b1 = point2[1]; j < m; ++j) {
          a0 = b0, a1 = b1, point2 = ring2[j], b0 = point2[0], b1 = point2[1];
          if (a1 <= y12) {
            if (b1 > y12 && (b0 - a0) * (y12 - a1) > (b1 - a1) * (x05 - a0)) ++winding;
          } else {
            if (b1 <= y12 && (b0 - a0) * (y12 - a1) < (b1 - a1) * (x05 - a0)) --winding;
          }
        }
      }
      return winding;
    }
    function polygonStart() {
      activeStream = bufferStream, segments = [], polygon = [], clean = true;
    }
    function polygonEnd() {
      var startInside = polygonInside(), cleanInside = clean && startInside, visible2 = (segments = merge(segments)).length;
      if (cleanInside || visible2) {
        stream.polygonStart();
        if (cleanInside) {
          stream.lineStart();
          interpolate(null, null, 1, stream);
          stream.lineEnd();
        }
        if (visible2) {
          rejoin_default(segments, compareIntersection2, startInside, interpolate, stream);
        }
        stream.polygonEnd();
      }
      activeStream = stream, segments = polygon = ring = null;
    }
    function lineStart() {
      clipStream.point = linePoint;
      if (polygon) polygon.push(ring = []);
      first = true;
      v_ = false;
      x_ = y_ = NaN;
    }
    function lineEnd() {
      if (segments) {
        linePoint(x__, y__);
        if (v__ && v_) bufferStream.rejoin();
        segments.push(bufferStream.result());
      }
      clipStream.point = point;
      if (v_) activeStream.lineEnd();
    }
    function linePoint(x, y) {
      var v = visible(x, y);
      if (polygon) ring.push([x, y]);
      if (first) {
        x__ = x, y__ = y, v__ = v;
        first = false;
        if (v) {
          activeStream.lineStart();
          activeStream.point(x, y);
        }
      } else {
        if (v && v_) activeStream.point(x, y);
        else {
          var a = [x_ = Math.max(clipMin, Math.min(clipMax, x_)), y_ = Math.max(clipMin, Math.min(clipMax, y_))], b = [x = Math.max(clipMin, Math.min(clipMax, x)), y = Math.max(clipMin, Math.min(clipMax, y))];
          if (line_default(a, b, x05, y05, x12, y12)) {
            if (!v_) {
              activeStream.lineStart();
              activeStream.point(a[0], a[1]);
            }
            activeStream.point(b[0], b[1]);
            if (!v) activeStream.lineEnd();
            clean = false;
          } else if (v) {
            activeStream.lineStart();
            activeStream.point(x, y);
            clean = false;
          }
        }
      }
      x_ = x, y_ = y, v_ = v;
    }
    return clipStream;
  };
}

// node_modules/d3-geo/src/identity.js
var identity_default2 = (x) => x;

// node_modules/d3-geo/src/path/area.js
var areaSum = new Adder();
var areaRingSum = new Adder();
var x00;
var y00;
var x0;
var y0;
var areaStream = {
  point: noop,
  lineStart: noop,
  lineEnd: noop,
  polygonStart: function() {
    areaStream.lineStart = areaRingStart;
    areaStream.lineEnd = areaRingEnd;
  },
  polygonEnd: function() {
    areaStream.lineStart = areaStream.lineEnd = areaStream.point = noop;
    areaSum.add(abs(areaRingSum));
    areaRingSum = new Adder();
  },
  result: function() {
    var area = areaSum / 2;
    areaSum = new Adder();
    return area;
  }
};
function areaRingStart() {
  areaStream.point = areaPointFirst;
}
function areaPointFirst(x, y) {
  areaStream.point = areaPoint;
  x00 = x0 = x, y00 = y0 = y;
}
function areaPoint(x, y) {
  areaRingSum.add(y0 * x - x0 * y);
  x0 = x, y0 = y;
}
function areaRingEnd() {
  areaPoint(x00, y00);
}
var area_default = areaStream;

// node_modules/d3-geo/src/path/bounds.js
var x02 = Infinity;
var y02 = x02;
var x1 = -x02;
var y1 = x1;
var boundsStream = {
  point: boundsPoint,
  lineStart: noop,
  lineEnd: noop,
  polygonStart: noop,
  polygonEnd: noop,
  result: function() {
    var bounds = [[x02, y02], [x1, y1]];
    x1 = y1 = -(y02 = x02 = Infinity);
    return bounds;
  }
};
function boundsPoint(x, y) {
  if (x < x02) x02 = x;
  if (x > x1) x1 = x;
  if (y < y02) y02 = y;
  if (y > y1) y1 = y;
}
var bounds_default = boundsStream;

// node_modules/d3-geo/src/path/centroid.js
var X0 = 0;
var Y0 = 0;
var Z0 = 0;
var X1 = 0;
var Y1 = 0;
var Z1 = 0;
var X2 = 0;
var Y2 = 0;
var Z2 = 0;
var x002;
var y002;
var x03;
var y03;
var centroidStream = {
  point: centroidPoint,
  lineStart: centroidLineStart,
  lineEnd: centroidLineEnd,
  polygonStart: function() {
    centroidStream.lineStart = centroidRingStart;
    centroidStream.lineEnd = centroidRingEnd;
  },
  polygonEnd: function() {
    centroidStream.point = centroidPoint;
    centroidStream.lineStart = centroidLineStart;
    centroidStream.lineEnd = centroidLineEnd;
  },
  result: function() {
    var centroid = Z2 ? [X2 / Z2, Y2 / Z2] : Z1 ? [X1 / Z1, Y1 / Z1] : Z0 ? [X0 / Z0, Y0 / Z0] : [NaN, NaN];
    X0 = Y0 = Z0 = X1 = Y1 = Z1 = X2 = Y2 = Z2 = 0;
    return centroid;
  }
};
function centroidPoint(x, y) {
  X0 += x;
  Y0 += y;
  ++Z0;
}
function centroidLineStart() {
  centroidStream.point = centroidPointFirstLine;
}
function centroidPointFirstLine(x, y) {
  centroidStream.point = centroidPointLine;
  centroidPoint(x03 = x, y03 = y);
}
function centroidPointLine(x, y) {
  var dx = x - x03, dy = y - y03, z = sqrt(dx * dx + dy * dy);
  X1 += z * (x03 + x) / 2;
  Y1 += z * (y03 + y) / 2;
  Z1 += z;
  centroidPoint(x03 = x, y03 = y);
}
function centroidLineEnd() {
  centroidStream.point = centroidPoint;
}
function centroidRingStart() {
  centroidStream.point = centroidPointFirstRing;
}
function centroidRingEnd() {
  centroidPointRing(x002, y002);
}
function centroidPointFirstRing(x, y) {
  centroidStream.point = centroidPointRing;
  centroidPoint(x002 = x03 = x, y002 = y03 = y);
}
function centroidPointRing(x, y) {
  var dx = x - x03, dy = y - y03, z = sqrt(dx * dx + dy * dy);
  X1 += z * (x03 + x) / 2;
  Y1 += z * (y03 + y) / 2;
  Z1 += z;
  z = y03 * x - x03 * y;
  X2 += z * (x03 + x);
  Y2 += z * (y03 + y);
  Z2 += z * 3;
  centroidPoint(x03 = x, y03 = y);
}
var centroid_default = centroidStream;

// node_modules/d3-geo/src/path/context.js
function PathContext(context) {
  this._context = context;
}
PathContext.prototype = {
  _radius: 4.5,
  pointRadius: function(_) {
    return this._radius = _, this;
  },
  polygonStart: function() {
    this._line = 0;
  },
  polygonEnd: function() {
    this._line = NaN;
  },
  lineStart: function() {
    this._point = 0;
  },
  lineEnd: function() {
    if (this._line === 0) this._context.closePath();
    this._point = NaN;
  },
  point: function(x, y) {
    switch (this._point) {
      case 0: {
        this._context.moveTo(x, y);
        this._point = 1;
        break;
      }
      case 1: {
        this._context.lineTo(x, y);
        break;
      }
      default: {
        this._context.moveTo(x + this._radius, y);
        this._context.arc(x, y, this._radius, 0, tau);
        break;
      }
    }
  },
  result: noop
};

// node_modules/d3-geo/src/path/measure.js
var lengthSum = new Adder();
var lengthRing;
var x003;
var y003;
var x04;
var y04;
var lengthStream = {
  point: noop,
  lineStart: function() {
    lengthStream.point = lengthPointFirst;
  },
  lineEnd: function() {
    if (lengthRing) lengthPoint(x003, y003);
    lengthStream.point = noop;
  },
  polygonStart: function() {
    lengthRing = true;
  },
  polygonEnd: function() {
    lengthRing = null;
  },
  result: function() {
    var length = +lengthSum;
    lengthSum = new Adder();
    return length;
  }
};
function lengthPointFirst(x, y) {
  lengthStream.point = lengthPoint;
  x003 = x04 = x, y003 = y04 = y;
}
function lengthPoint(x, y) {
  x04 -= x, y04 -= y;
  lengthSum.add(sqrt(x04 * x04 + y04 * y04));
  x04 = x, y04 = y;
}
var measure_default = lengthStream;

// node_modules/d3-geo/src/path/string.js
var cacheDigits;
var cacheAppend;
var cacheRadius;
var cacheCircle;
var PathString = class {
  constructor(digits) {
    this._append = digits == null ? append : appendRound(digits);
    this._radius = 4.5;
    this._ = "";
  }
  pointRadius(_) {
    this._radius = +_;
    return this;
  }
  polygonStart() {
    this._line = 0;
  }
  polygonEnd() {
    this._line = NaN;
  }
  lineStart() {
    this._point = 0;
  }
  lineEnd() {
    if (this._line === 0) this._ += "Z";
    this._point = NaN;
  }
  point(x, y) {
    switch (this._point) {
      case 0: {
        this._append`M${x},${y}`;
        this._point = 1;
        break;
      }
      case 1: {
        this._append`L${x},${y}`;
        break;
      }
      default: {
        this._append`M${x},${y}`;
        if (this._radius !== cacheRadius || this._append !== cacheAppend) {
          const r = this._radius;
          const s = this._;
          this._ = "";
          this._append`m0,${r}a${r},${r} 0 1,1 0,${-2 * r}a${r},${r} 0 1,1 0,${2 * r}z`;
          cacheRadius = r;
          cacheAppend = this._append;
          cacheCircle = this._;
          this._ = s;
        }
        this._ += cacheCircle;
        break;
      }
    }
  }
  result() {
    const result = this._;
    this._ = "";
    return result.length ? result : null;
  }
};
function append(strings) {
  let i = 1;
  this._ += strings[0];
  for (const j = strings.length; i < j; ++i) {
    this._ += arguments[i] + strings[i];
  }
}
function appendRound(digits) {
  const d = Math.floor(digits);
  if (!(d >= 0)) throw new RangeError(`invalid digits: ${digits}`);
  if (d > 15) return append;
  if (d !== cacheDigits) {
    const k = 10 ** d;
    cacheDigits = d;
    cacheAppend = function append2(strings) {
      let i = 1;
      this._ += strings[0];
      for (const j = strings.length; i < j; ++i) {
        this._ += Math.round(arguments[i] * k) / k + strings[i];
      }
    };
  }
  return cacheAppend;
}

// node_modules/d3-geo/src/path/index.js
function path_default(projection2, context) {
  let digits = 3, pointRadius = 4.5, projectionStream, contextStream;
  function path(object2) {
    if (object2) {
      if (typeof pointRadius === "function") contextStream.pointRadius(+pointRadius.apply(this, arguments));
      stream_default(object2, projectionStream(contextStream));
    }
    return contextStream.result();
  }
  path.area = function(object2) {
    stream_default(object2, projectionStream(area_default));
    return area_default.result();
  };
  path.measure = function(object2) {
    stream_default(object2, projectionStream(measure_default));
    return measure_default.result();
  };
  path.bounds = function(object2) {
    stream_default(object2, projectionStream(bounds_default));
    return bounds_default.result();
  };
  path.centroid = function(object2) {
    stream_default(object2, projectionStream(centroid_default));
    return centroid_default.result();
  };
  path.projection = function(_) {
    if (!arguments.length) return projection2;
    projectionStream = _ == null ? (projection2 = null, identity_default2) : (projection2 = _).stream;
    return path;
  };
  path.context = function(_) {
    if (!arguments.length) return context;
    contextStream = _ == null ? (context = null, new PathString(digits)) : new PathContext(context = _);
    if (typeof pointRadius !== "function") contextStream.pointRadius(pointRadius);
    return path;
  };
  path.pointRadius = function(_) {
    if (!arguments.length) return pointRadius;
    pointRadius = typeof _ === "function" ? _ : (contextStream.pointRadius(+_), +_);
    return path;
  };
  path.digits = function(_) {
    if (!arguments.length) return digits;
    if (_ == null) digits = null;
    else {
      const d = Math.floor(_);
      if (!(d >= 0)) throw new RangeError(`invalid digits: ${_}`);
      digits = d;
    }
    if (context === null) contextStream = new PathString(digits);
    return path;
  };
  return path.projection(projection2).digits(digits).context(context);
}

// node_modules/d3-geo/src/transform.js
function transformer(methods) {
  return function(stream) {
    var s = new TransformStream();
    for (var key in methods) s[key] = methods[key];
    s.stream = stream;
    return s;
  };
}
function TransformStream() {
}
TransformStream.prototype = {
  constructor: TransformStream,
  point: function(x, y) {
    this.stream.point(x, y);
  },
  sphere: function() {
    this.stream.sphere();
  },
  lineStart: function() {
    this.stream.lineStart();
  },
  lineEnd: function() {
    this.stream.lineEnd();
  },
  polygonStart: function() {
    this.stream.polygonStart();
  },
  polygonEnd: function() {
    this.stream.polygonEnd();
  }
};

// node_modules/d3-geo/src/projection/fit.js
function fit(projection2, fitBounds, object2) {
  var clip = projection2.clipExtent && projection2.clipExtent();
  projection2.scale(150).translate([0, 0]);
  if (clip != null) projection2.clipExtent(null);
  stream_default(object2, projection2.stream(bounds_default));
  fitBounds(bounds_default.result());
  if (clip != null) projection2.clipExtent(clip);
  return projection2;
}
function fitExtent(projection2, extent, object2) {
  return fit(projection2, function(b) {
    var w = extent[1][0] - extent[0][0], h = extent[1][1] - extent[0][1], k = Math.min(w / (b[1][0] - b[0][0]), h / (b[1][1] - b[0][1])), x = +extent[0][0] + (w - k * (b[1][0] + b[0][0])) / 2, y = +extent[0][1] + (h - k * (b[1][1] + b[0][1])) / 2;
    projection2.scale(150 * k).translate([x, y]);
  }, object2);
}
function fitSize(projection2, size, object2) {
  return fitExtent(projection2, [[0, 0], size], object2);
}
function fitWidth(projection2, width, object2) {
  return fit(projection2, function(b) {
    var w = +width, k = w / (b[1][0] - b[0][0]), x = (w - k * (b[1][0] + b[0][0])) / 2, y = -k * b[0][1];
    projection2.scale(150 * k).translate([x, y]);
  }, object2);
}
function fitHeight(projection2, height, object2) {
  return fit(projection2, function(b) {
    var h = +height, k = h / (b[1][1] - b[0][1]), x = -k * b[0][0], y = (h - k * (b[1][1] + b[0][1])) / 2;
    projection2.scale(150 * k).translate([x, y]);
  }, object2);
}

// node_modules/d3-geo/src/projection/resample.js
var maxDepth = 16;
var cosMinDistance = cos(30 * radians);
function resample_default(project, delta2) {
  return +delta2 ? resample(project, delta2) : resampleNone(project);
}
function resampleNone(project) {
  return transformer({
    point: function(x, y) {
      x = project(x, y);
      this.stream.point(x[0], x[1]);
    }
  });
}
function resample(project, delta2) {
  function resampleLineTo(x05, y05, lambda0, a0, b0, c0, x12, y12, lambda1, a1, b1, c1, depth, stream) {
    var dx = x12 - x05, dy = y12 - y05, d2 = dx * dx + dy * dy;
    if (d2 > 4 * delta2 && depth--) {
      var a = a0 + a1, b = b0 + b1, c = c0 + c1, m = sqrt(a * a + b * b + c * c), phi2 = asin(c /= m), lambda2 = abs(abs(c) - 1) < epsilon || abs(lambda0 - lambda1) < epsilon ? (lambda0 + lambda1) / 2 : atan2(b, a), p = project(lambda2, phi2), x2 = p[0], y2 = p[1], dx2 = x2 - x05, dy2 = y2 - y05, dz = dy * dx2 - dx * dy2;
      if (dz * dz / d2 > delta2 || abs((dx * dx2 + dy * dy2) / d2 - 0.5) > 0.3 || a0 * a1 + b0 * b1 + c0 * c1 < cosMinDistance) {
        resampleLineTo(x05, y05, lambda0, a0, b0, c0, x2, y2, lambda2, a /= m, b /= m, c, depth, stream);
        stream.point(x2, y2);
        resampleLineTo(x2, y2, lambda2, a, b, c, x12, y12, lambda1, a1, b1, c1, depth, stream);
      }
    }
  }
  return function(stream) {
    var lambda00, x004, y004, a00, b00, c00, lambda0, x05, y05, a0, b0, c0;
    var resampleStream = {
      point,
      lineStart,
      lineEnd,
      polygonStart: function() {
        stream.polygonStart();
        resampleStream.lineStart = ringStart;
      },
      polygonEnd: function() {
        stream.polygonEnd();
        resampleStream.lineStart = lineStart;
      }
    };
    function point(x, y) {
      x = project(x, y);
      stream.point(x[0], x[1]);
    }
    function lineStart() {
      x05 = NaN;
      resampleStream.point = linePoint;
      stream.lineStart();
    }
    function linePoint(lambda, phi) {
      var c = cartesian([lambda, phi]), p = project(lambda, phi);
      resampleLineTo(x05, y05, lambda0, a0, b0, c0, x05 = p[0], y05 = p[1], lambda0 = lambda, a0 = c[0], b0 = c[1], c0 = c[2], maxDepth, stream);
      stream.point(x05, y05);
    }
    function lineEnd() {
      resampleStream.point = point;
      stream.lineEnd();
    }
    function ringStart() {
      lineStart();
      resampleStream.point = ringPoint;
      resampleStream.lineEnd = ringEnd;
    }
    function ringPoint(lambda, phi) {
      linePoint(lambda00 = lambda, phi), x004 = x05, y004 = y05, a00 = a0, b00 = b0, c00 = c0;
      resampleStream.point = linePoint;
    }
    function ringEnd() {
      resampleLineTo(x05, y05, lambda0, a0, b0, c0, x004, y004, lambda00, a00, b00, c00, maxDepth, stream);
      resampleStream.lineEnd = lineEnd;
      lineEnd();
    }
    return resampleStream;
  };
}

// node_modules/d3-geo/src/projection/index.js
var transformRadians = transformer({
  point: function(x, y) {
    this.stream.point(x * radians, y * radians);
  }
});
function transformRotate(rotate) {
  return transformer({
    point: function(x, y) {
      var r = rotate(x, y);
      return this.stream.point(r[0], r[1]);
    }
  });
}
function scaleTranslate(k, dx, dy, sx, sy) {
  function transform(x, y) {
    x *= sx;
    y *= sy;
    return [dx + k * x, dy - k * y];
  }
  transform.invert = function(x, y) {
    return [(x - dx) / k * sx, (dy - y) / k * sy];
  };
  return transform;
}
function scaleTranslateRotate(k, dx, dy, sx, sy, alpha) {
  if (!alpha) return scaleTranslate(k, dx, dy, sx, sy);
  var cosAlpha = cos(alpha), sinAlpha = sin(alpha), a = cosAlpha * k, b = sinAlpha * k, ai = cosAlpha / k, bi = sinAlpha / k, ci = (sinAlpha * dy - cosAlpha * dx) / k, fi = (sinAlpha * dx + cosAlpha * dy) / k;
  function transform(x, y) {
    x *= sx;
    y *= sy;
    return [a * x - b * y + dx, dy - b * x - a * y];
  }
  transform.invert = function(x, y) {
    return [sx * (ai * x - bi * y + ci), sy * (fi - bi * x - ai * y)];
  };
  return transform;
}
function projection(project) {
  return projectionMutator(function() {
    return project;
  })();
}
function projectionMutator(projectAt) {
  var project, k = 150, x = 480, y = 250, lambda = 0, phi = 0, deltaLambda = 0, deltaPhi = 0, deltaGamma = 0, rotate, alpha = 0, sx = 1, sy = 1, theta = null, preclip = antimeridian_default, x05 = null, y05, x12, y12, postclip = identity_default2, delta2 = 0.5, projectResample, projectTransform, projectRotateTransform, cache, cacheStream;
  function projection2(point) {
    return projectRotateTransform(point[0] * radians, point[1] * radians);
  }
  function invert(point) {
    point = projectRotateTransform.invert(point[0], point[1]);
    return point && [point[0] * degrees, point[1] * degrees];
  }
  projection2.stream = function(stream) {
    return cache && cacheStream === stream ? cache : cache = transformRadians(transformRotate(rotate)(preclip(projectResample(postclip(cacheStream = stream)))));
  };
  projection2.preclip = function(_) {
    return arguments.length ? (preclip = _, theta = void 0, reset()) : preclip;
  };
  projection2.postclip = function(_) {
    return arguments.length ? (postclip = _, x05 = y05 = x12 = y12 = null, reset()) : postclip;
  };
  projection2.clipAngle = function(_) {
    return arguments.length ? (preclip = +_ ? circle_default(theta = _ * radians) : (theta = null, antimeridian_default), reset()) : theta * degrees;
  };
  projection2.clipExtent = function(_) {
    return arguments.length ? (postclip = _ == null ? (x05 = y05 = x12 = y12 = null, identity_default2) : clipRectangle(x05 = +_[0][0], y05 = +_[0][1], x12 = +_[1][0], y12 = +_[1][1]), reset()) : x05 == null ? null : [[x05, y05], [x12, y12]];
  };
  projection2.scale = function(_) {
    return arguments.length ? (k = +_, recenter()) : k;
  };
  projection2.translate = function(_) {
    return arguments.length ? (x = +_[0], y = +_[1], recenter()) : [x, y];
  };
  projection2.center = function(_) {
    return arguments.length ? (lambda = _[0] % 360 * radians, phi = _[1] % 360 * radians, recenter()) : [lambda * degrees, phi * degrees];
  };
  projection2.rotate = function(_) {
    return arguments.length ? (deltaLambda = _[0] % 360 * radians, deltaPhi = _[1] % 360 * radians, deltaGamma = _.length > 2 ? _[2] % 360 * radians : 0, recenter()) : [deltaLambda * degrees, deltaPhi * degrees, deltaGamma * degrees];
  };
  projection2.angle = function(_) {
    return arguments.length ? (alpha = _ % 360 * radians, recenter()) : alpha * degrees;
  };
  projection2.reflectX = function(_) {
    return arguments.length ? (sx = _ ? -1 : 1, recenter()) : sx < 0;
  };
  projection2.reflectY = function(_) {
    return arguments.length ? (sy = _ ? -1 : 1, recenter()) : sy < 0;
  };
  projection2.precision = function(_) {
    return arguments.length ? (projectResample = resample_default(projectTransform, delta2 = _ * _), reset()) : sqrt(delta2);
  };
  projection2.fitExtent = function(extent, object2) {
    return fitExtent(projection2, extent, object2);
  };
  projection2.fitSize = function(size, object2) {
    return fitSize(projection2, size, object2);
  };
  projection2.fitWidth = function(width, object2) {
    return fitWidth(projection2, width, object2);
  };
  projection2.fitHeight = function(height, object2) {
    return fitHeight(projection2, height, object2);
  };
  function recenter() {
    var center = scaleTranslateRotate(k, 0, 0, sx, sy, alpha).apply(null, project(lambda, phi)), transform = scaleTranslateRotate(k, x - center[0], y - center[1], sx, sy, alpha);
    rotate = rotateRadians(deltaLambda, deltaPhi, deltaGamma);
    projectTransform = compose_default(project, transform);
    projectRotateTransform = compose_default(rotate, projectTransform);
    projectResample = resample_default(projectTransform, delta2);
    return reset();
  }
  function reset() {
    cache = cacheStream = null;
    return projection2;
  }
  return function() {
    project = projectAt.apply(this, arguments);
    projection2.invert = project.invert && invert;
    return recenter();
  };
}

// node_modules/d3-geo/src/projection/naturalEarth1.js
function naturalEarth1Raw(lambda, phi) {
  var phi2 = phi * phi, phi4 = phi2 * phi2;
  return [
    lambda * (0.8707 - 0.131979 * phi2 + phi4 * (-0.013791 + phi4 * (3971e-6 * phi2 - 1529e-6 * phi4))),
    phi * (1.007226 + phi2 * (0.015085 + phi4 * (-0.044475 + 0.028874 * phi2 - 5916e-6 * phi4)))
  ];
}
naturalEarth1Raw.invert = function(x, y) {
  var phi = y, i = 25, delta;
  do {
    var phi2 = phi * phi, phi4 = phi2 * phi2;
    phi -= delta = (phi * (1.007226 + phi2 * (0.015085 + phi4 * (-0.044475 + 0.028874 * phi2 - 5916e-6 * phi4))) - y) / (1.007226 + phi2 * (0.015085 * 3 + phi4 * (-0.044475 * 7 + 0.028874 * 9 * phi2 - 5916e-6 * 11 * phi4)));
  } while (abs(delta) > epsilon && --i > 0);
  return [
    x / (0.8707 + (phi2 = phi * phi) * (-0.131979 + phi2 * (-0.013791 + phi2 * phi2 * phi2 * (3971e-6 - 1529e-6 * phi2)))),
    phi
  ];
};
function naturalEarth1_default() {
  return projection(naturalEarth1Raw).scale(175.295);
}

// web/src/map/camera.js
var BASE_MAP_SCALE = 0.19;
var CAMERA_LIMITS = { minZoom: 0.55, maxZoom: 7 };
function projectionForCamera(width, height, camera = { x: 0, y: 0, zoom: 1 }) {
  return naturalEarth1_default().translate([width / 2 + camera.x, height / 2 + camera.y]).scale(camera.zoom * Math.min(width, height) * BASE_MAP_SCALE);
}
function projectedSphereBounds(width, height, zoom) {
  const projection2 = projectionForCamera(width, height, { x: 0, y: 0, zoom });
  return path_default(projection2).bounds({ type: "Sphere" });
}
function minZoomForViewport(width, height) {
  const [[x05, y05], [x12, y12]] = projectedSphereBounds(width, height, 1);
  const bw = Math.max(1, x12 - x05);
  const bh = Math.max(1, y12 - y05);
  const cover = 0.96;
  return Math.max(CAMERA_LIMITS.minZoom, width * cover / bw, height * cover / bh);
}
function clampZoom(zoom, width = 0, height = 0) {
  const minZoom = width > 0 && height > 0 ? minZoomForViewport(width, height) : CAMERA_LIMITS.minZoom;
  return Math.max(minZoom, Math.min(CAMERA_LIMITS.maxZoom, zoom));
}
function constrainCamera(camera, width, height) {
  const zoom = clampZoom(camera.zoom, width, height);
  const [[left0, top0], [right0, bottom0]] = projectedSphereBounds(width, height, zoom);
  const bw = right0 - left0;
  const bh = bottom0 - top0;
  const padX = Math.min(28, width * 0.04);
  const padY = Math.min(24, height * 0.04);
  let x = camera.x;
  let y = camera.y;
  if (bw <= width - padX * 2) {
    x = 0;
  } else {
    const minX = width - padX - right0;
    const maxX = padX - left0;
    x = Math.max(minX, Math.min(maxX, x));
  }
  if (bh <= height - padY * 2) {
    y = 0;
  } else {
    const minY = height - padY - bottom0;
    const maxY = padY - top0;
    y = Math.max(minY, Math.min(maxY, y));
  }
  return { zoom, x, y };
}
function zoomAtPoint(camera, factor, px, py, width, height) {
  const nextZoom = clampZoom(camera.zoom * factor, width, height);
  const zf = nextZoom / camera.zoom;
  const next = {
    zoom: nextZoom,
    x: camera.x * zf + (1 - zf) * (px - width / 2),
    y: camera.y * zf + (1 - zf) * (py - height / 2)
  };
  return constrainCamera(next, width, height);
}
function applyCameraTransform(ctx, camera, width, height) {
  ctx.translate(width / 2 + camera.x, height / 2 + camera.y);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-width / 2, -height / 2);
}
function screenToWorld(camera, x, y, width, height) {
  return {
    x: width / 2 + (x - (width / 2 + camera.x)) / camera.zoom,
    y: height / 2 + (y - (height / 2 + camera.y)) / camera.zoom
  };
}
function fitCameraToFeature(feature2, width, height) {
  const padding = Math.min(width, height) * 0.16;
  const baseProjection = projectionForCamera(width, height, { x: 0, y: 0, zoom: 1 });
  const basePath = path_default(baseProjection);
  const [[x05, y05], [x12, y12]] = basePath.bounds(feature2);
  const bw = Math.max(1, x12 - x05);
  const bh = Math.max(1, y12 - y05);
  const cx = (x05 + x12) / 2;
  const cy = (y05 + y12) / 2;
  const targetZoom = clampZoom(Math.min((width - 2 * padding) / bw, (height - 2 * padding) / bh), width, height);
  const camera = {
    zoom: targetZoom,
    x: (width / 2 - cx) * targetZoom,
    y: (height / 2 - cy) * targetZoom
  };
  return constrainCamera(camera, width, height);
}

// web/src/map/projection.js
function createProjection(width, height) {
  const projection2 = naturalEarth1_default().translate([width / 2, height / 2]).scale(Math.min(width, height) * BASE_MAP_SCALE);
  const path = path_default(projection2);
  return { projection: projection2, path };
}

// web/src/map/styles.js
function stableCountryColour(cca3, seed) {
  const h = hashString(`${seed}:${cca3}`) % 360;
  return `hsl(${h} 42% 44%)`;
}
function heatmapColour(t) {
  const x = Math.max(0, Math.min(1, t));
  const hue = 220 - x * 180;
  return `hsl(${hue} 74% ${38 + x * 18}%)`;
}

// web/src/map/picking.js
var PICK_GRID_SIZE = 36;
function createSpatialIndex(entries) {
  const cells = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    const [[x05, y05], [x12, y12]] = entry.bbox;
    const minCellX = Math.floor(x05 / PICK_GRID_SIZE);
    const maxCellX = Math.floor(x12 / PICK_GRID_SIZE);
    const minCellY = Math.floor(y05 / PICK_GRID_SIZE);
    const maxCellY = Math.floor(y12 / PICK_GRID_SIZE);
    for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        const key = `${cellX}:${cellY}`;
        const bucket = cells.get(key);
        if (bucket) bucket.push(entry);
        else cells.set(key, [entry]);
      }
    }
  }
  return { cells, cellSize: PICK_GRID_SIZE };
}
function getCandidatesFromIndex(index, worldPoint, worldTolerance) {
  if (!index) return [];
  const { cells, cellSize } = index;
  const minCellX = Math.floor((worldPoint.x - worldTolerance) / cellSize);
  const maxCellX = Math.floor((worldPoint.x + worldTolerance) / cellSize);
  const minCellY = Math.floor((worldPoint.y - worldTolerance) / cellSize);
  const maxCellY = Math.floor((worldPoint.y + worldTolerance) / cellSize);
  const seen = /* @__PURE__ */ new Set();
  const candidates = [];
  for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      const bucket = cells.get(`${cellX}:${cellY}`);
      if (!bucket) continue;
      for (const entry of bucket) {
        if (seen.has(entry)) continue;
        seen.add(entry);
        candidates.push(entry);
      }
    }
  }
  return candidates;
}
function rebuildPickCache(features, path) {
  const entries = features.map((feature2) => {
    const p = new Path2D(path(feature2));
    const b = path.bounds(feature2);
    return { feature: feature2, path2d: p, bbox: b };
  });
  entries.spatialIndex = createSpatialIndex(entries);
  return entries;
}
function pickCountry(ctx, pickCache, camera, width, height, x, y, tolerance = 3) {
  const worldPoint = screenToWorld(camera, x, y, width, height);
  const worldTolerance = tolerance / camera.zoom;
  const indexedCandidates = getCandidatesFromIndex(pickCache.spatialIndex, worldPoint, worldTolerance);
  const candidates = indexedCandidates.filter((entry) => {
    const [[x05, y05], [x12, y12]] = entry.bbox;
    return worldPoint.x >= x05 - worldTolerance && worldPoint.x <= x12 + worldTolerance && worldPoint.y >= y05 - worldTolerance && worldPoint.y <= y12 + worldTolerance;
  });
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    if (ctx.isPointInPath(candidates[i].path2d, worldPoint.x, worldPoint.y)) {
      return { cca3: candidates[i].feature.properties.cca3, candidates: candidates.length };
    }
  }
  return { cca3: null, candidates: candidates.length };
}

// web/src/map/renderer.js
function diplomacyFill(state, cca3) {
  if (!state.selected) return "#2a3c55";
  if (cca3 === state.selected) return "#f2c14e";
  const edge = state.relations?.[state.selected]?.[cca3];
  if (!edge) return "#1a2433";
  const rel = edge.rel;
  if (rel >= 35) return "#2f8f66";
  if (rel <= -35) return "#a64f4f";
  return "#6e7787";
}
function relationStroke(state, cca3) {
  const edge = state.selected ? state.relations?.[state.selected]?.[cca3] : null;
  if (!edge) return null;
  const t = edge.tension / 100;
  const width = 0.7 + t * 2.8;
  const alpha = 0.15 + t * 0.7;
  const hue = 125 - t * 125;
  return { stroke: `hsla(${hue} 85% 60% / ${alpha})`, width };
}
function createRenderer(canvas, topo2, getState) {
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const world = feature_default(topo2, topo2.objects.countries);
  let width = 1;
  let height = 1;
  let pickCache = [];
  let pickByCca3 = {};
  let geometryKey = "";
  let spherePath2d = null;
  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function ensureGeometryCache() {
    const nextGeometryKey = `${width}:${height}:naturalEarth1`;
    if (nextGeometryKey === geometryKey && pickCache.length && spherePath2d) return;
    const { path } = createProjection(width, height);
    pickCache = rebuildPickCache(world.features, path);
    pickByCca3 = {};
    for (const entry of pickCache) {
      pickByCca3[entry.feature.properties.cca3] = entry;
    }
    spherePath2d = new Path2D(path({ type: "Sphere" }));
    geometryKey = nextGeometryKey;
  }
  function draw(alpha = 1) {
    const state = getState();
    ensureGeometryCache();
    const { min: metricMin, max: metricMax } = selectActiveMetricRange(state);
    ctx.clearRect(0, 0, width, height);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.save();
    applyCameraTransform(ctx, state.camera, width, height);
    if (spherePath2d) {
      ctx.fillStyle = "#0d1828";
      ctx.globalAlpha = 0.3;
      ctx.fill(spherePath2d);
    }
    for (const entry of pickCache) {
      const { feature: f, path2d } = entry;
      const cca3 = f.properties.cca3;
      const value = selectActiveMetricValue(state, cca3);
      const t = (value - metricMin) / (metricMax - metricMin || 1);
      const fill = state.overlay === "heatmap" ? heatmapColour(t) : state.overlay === "diplomacy" ? diplomacyFill(state, cca3) : stableCountryColour(cca3, state.seed);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fill;
      ctx.fill(path2d);
      ctx.strokeStyle = "#1a2a3f";
      ctx.lineWidth = 0.75 / state.camera.zoom;
      ctx.stroke(path2d);
      if (state.overlay === "diplomacy" && state.selected) {
        const border = relationStroke(state, cca3);
        if (border) {
          ctx.strokeStyle = border.stroke;
          ctx.lineWidth = border.width / state.camera.zoom;
          ctx.stroke(path2d);
        }
      }
    }
    if (spherePath2d) {
      ctx.save();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(166, 202, 244, 0.55)";
      ctx.lineWidth = 1.4 / state.camera.zoom;
      ctx.stroke(spherePath2d);
      ctx.restore();
    }
    const hover = pickByCca3[state.hovered];
    if (hover) {
      ctx.save();
      ctx.setLineDash([4 / state.camera.zoom, 4 / state.camera.zoom]);
      ctx.strokeStyle = "rgba(255,255,255,.8)";
      ctx.lineWidth = 1.2 / state.camera.zoom;
      ctx.stroke(hover.path2d);
      ctx.restore();
    }
    const selected = pickByCca3[state.selected];
    if (selected) {
      ctx.save();
      ctx.setLineDash([6 / state.camera.zoom, 4 / state.camera.zoom]);
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = 2 / state.camera.zoom;
      ctx.stroke(selected.path2d);
      ctx.restore();
    }
    ctx.restore();
  }
  return { ctx, world, resize, draw, getPickCache: () => pickCache };
}

// web/src/util/perf.js
function createFpsCounter() {
  let last2 = performance.now();
  let frames = 0;
  let fps = 0;
  return {
    tick() {
      frames += 1;
      const now = performance.now();
      if (now - last2 >= 1e3) {
        fps = frames;
        frames = 0;
        last2 = now;
      }
      return fps;
    }
  };
}

// web/src/main.js
var root = document.getElementById("app");
async function fetchJsonSafe(url, fallback) {
  try {
    const res = await fetch(url);
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}
root.textContent = "Loading data\u2026";
var [countries, topo, neighboursPayload, fullCountries] = await Promise.all([
  fetchJsonSafe("/api/countries", []),
  fetchJsonSafe("/api/borders", null),
  fetchJsonSafe("/api/neighbours", { neighbours: {} }),
  fetchJsonSafe("/api/countries/full", [])
]);
var countryIndex = Object.fromEntries(fullCountries.filter((c) => c?.cca3).map((c) => [c.cca3, c]));
if (!topo || !topo.objects?.countries) {
  root.textContent = "Failed to load border geometry cache. Run data build and refresh the page.";
  throw new Error("Missing /api/borders topology payload");
}
var neighbours = neighboursPayload?.neighbours ?? {};
var initialRelations = createInitialRelations(1337, neighbours, countryIndex);
root.innerHTML = "";
var ui = buildLayout(root);
var store = createStore({
  seed: 1337,
  turn: 0,
  paused: true,
  speed: 1,
  hovered: null,
  selected: null,
  overlay: "political",
  metric: "gdp",
  search: "",
  dossierOpen: false,
  debug: false,
  events: [],
  camera: { x: 0, y: 0, zoom: 1 },
  countryIndex,
  neighbours,
  dynamic: createInitialSimState(countryIndex),
  relations: initialRelations.relations,
  relationEdges: initialRelations.edges,
  postureByCountry: {}
});
var actions = createActions(store);
var controls = renderTopbar(ui.topbar, actions);
wireSearch(controls.search, fullCountries, actions);
controls.save.onclick = () => saveToLocal(makeSnapshot(store.getState()));
controls.load.onclick = () => {
  const s = loadFromLocal();
  if (s) actions.loadState(s);
};
controls.exportBtn.onclick = () => exportJson(makeSnapshot(store.getState()));
controls.importBtn.onclick = async () => {
  const s = await importJsonFile();
  if (s) actions.loadState(s);
};
controls.newGame.onclick = () => actions.newGame(Math.random() * 1e9 | 0);
controls.help.onclick = () => showHelp();
var renderer = createRenderer(ui.canvas, topo, store.getState);
renderer.resize();
actions.setCamera(constrainCamera(store.getState().camera, ui.canvas.clientWidth, ui.canvas.clientHeight));
var dirty = true;
var mouse = { x: 0, y: 0 };
var latestHoverPointer = null;
var hoverPickQueued = false;
var debugInfo = { fps: 0, candidates: 0, renderMs: 0 };
var fpsCounter = createFpsCounter();
var prevTooltipInputs = null;
var prevDossierInputs = null;
var prevLegendInputs = null;
var prevDebugInputs = null;
function getTooltipInputs(state) {
  const hovered = state.hovered;
  const country = hovered ? state.countryIndex[hovered] : null;
  const dyn = hovered ? state.dynamic[hovered] : null;
  const metricValue = hovered ? state.metric === "militaryPercentGdp" ? dyn?.militaryPct : state.metric === "gdp" ? dyn?.gdp : country?.indicators?.[state.metric] : null;
  return {
    hovered,
    x: mouse.x,
    y: mouse.y,
    metric: state.metric,
    metricValue,
    gdp: dyn?.gdp,
    population: country?.population
  };
}
function getDossierInputs(state) {
  const selected = state.selected;
  const dyn = selected ? state.dynamic[selected] : null;
  const influenceHint = selected ? selectNextTurnGainHint(state, selected) : null;
  const eventSlice = selected ? state.events.filter((e) => e.cca3 === selected).slice(0, 8).map((e) => `${e.turn}:${e.text}`).join("|") : "";
  const neighbourSlice = selected ? getNeighbours(selected, state.neighbours).slice(0, 12).map((n) => `${n}:${state.relations?.[selected]?.[n]?.rel ?? 0}/${state.relations?.[selected]?.[n]?.tension ?? 0}`).join("|") : "";
  return {
    selected,
    dossierOpen: state.dossierOpen,
    gdp: dyn?.gdp,
    militaryPct: dyn?.militaryPct,
    stability: dyn?.stability,
    influence: dyn?.influence,
    influenceGainHint: influenceHint?.gain,
    influenceHintTopGdp: influenceHint?.reasons?.topGdpPercentile,
    eventSlice,
    neighbourSlice
  };
}
function getLegendInputs(state) {
  const { min, max } = selectActiveMetricRange(state);
  return {
    overlay: state.overlay,
    metric: state.metric,
    min,
    max
  };
}
function getDebugInputs(state) {
  return {
    debug: state.debug,
    fps: debugInfo.fps,
    turn: state.turn,
    hovered: state.hovered,
    candidates: state.debugInfo?.candidates,
    renderMs: state.debugInfo?.renderMs
  };
}
function shallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every((k) => a[k] === b[k]);
}
store.subscribe(() => {
  dirty = true;
});
window.addEventListener("resize", () => {
  renderer.resize();
  actions.setCamera(constrainCamera(store.getState().camera, ui.canvas.clientWidth, ui.canvas.clientHeight));
  dirty = true;
});
var drag = null;
ui.canvas.addEventListener("mousedown", (e) => {
  drag = { x: e.clientX, y: e.clientY, cam: store.getState().camera };
  ui.canvas.classList.add("dragging");
});
window.addEventListener("mouseup", () => {
  drag = null;
  ui.canvas.classList.remove("dragging");
});
window.addEventListener("mousemove", (e) => {
  mouse = { x: e.offsetX, y: e.offsetY };
  if (drag) {
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    actions.setCamera(constrainCamera({ ...drag.cam, x: drag.cam.x + dx, y: drag.cam.y + dy }, ui.canvas.clientWidth, ui.canvas.clientHeight));
    return;
  }
  latestHoverPointer = { x: e.offsetX, y: e.offsetY };
  hoverPickQueued = true;
});
ui.canvas.addEventListener("click", (e) => {
  const hit = pickCountry(renderer.ctx, renderer.getPickCache(), store.getState().camera, ui.canvas.clientWidth, ui.canvas.clientHeight, e.offsetX, e.offsetY, 6);
  if (!hit.cca3) return;
  actions.selectCountry(hit.cca3);
  const entry = renderer.getPickCache().find((x) => x.feature.properties.cca3 === hit.cca3);
  if (entry) animateCamera(fitCameraToFeature(entry.feature, ui.canvas.clientWidth, ui.canvas.clientHeight));
});
ui.canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const factor = Math.exp(-Math.sign(e.deltaY) * 0.08);
  actions.setCamera(zoomAtPoint(store.getState().camera, factor, e.offsetX, e.offsetY, ui.canvas.clientWidth, ui.canvas.clientHeight));
}, { passive: false });
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeHelp();
  if (isTypingTarget()) return;
  if (e.code === "Space") {
    e.preventDefault();
    actions.togglePause();
  }
  if (e.key === "ArrowRight") actions.stepTurn();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
    e.preventDefault();
    controls.search.focus();
  }
  if (e.key.toLowerCase() === "d") actions.toggleDebug();
});
var acc = 0;
var last = performance.now();
function frame(now) {
  const dt = (now - last) / 1e3;
  last = now;
  const state = store.getState();
  if (!state.paused) {
    acc += dt * state.speed;
    while (acc >= 1) {
      actions.stepTurn();
      acc -= 1;
    }
  }
  if (hoverPickQueued && latestHoverPointer) {
    const hit = pickCountry(
      renderer.ctx,
      renderer.getPickCache(),
      state.camera,
      ui.canvas.clientWidth,
      ui.canvas.clientHeight,
      latestHoverPointer.x,
      latestHoverPointer.y,
      4
    );
    debugInfo.candidates = hit.candidates;
    actions.setHover(hit.cca3);
    hoverPickQueued = false;
  }
  if (dirty) drawNow();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
function drawNow() {
  dirty = false;
  const t0 = performance.now();
  renderer.draw();
  debugInfo.fps = fpsCounter.tick();
  debugInfo.renderMs = performance.now() - t0;
  const state = store.getState();
  const tooltipInputs = getTooltipInputs(state);
  if (!shallowEqual(prevTooltipInputs, tooltipInputs)) {
    renderTooltip(ui.tooltip, state, mouse.x, mouse.y);
    prevTooltipInputs = tooltipInputs;
  }
  const dossierInputs = getDossierInputs(state);
  if (!shallowEqual(prevDossierInputs, dossierInputs)) {
    renderDossier(ui.dossier, state);
    prevDossierInputs = dossierInputs;
  }
  const legendInputs = getLegendInputs(state);
  if (!shallowEqual(prevLegendInputs, legendInputs)) {
    renderLegend(ui.legend, {
      ...state,
      heatNorm(metric, dyn, c) {
        const v = metric === "militaryPercentGdp" ? dyn.militaryPct : metric === "gdp" ? dyn.gdp : c.indicators[metric];
        const rangeState = metric === state.metric ? state : { ...state, metric };
        const { min, max } = selectActiveMetricRange(rangeState);
        return (v - min) / (max - min || 1);
      }
    });
    prevLegendInputs = legendInputs;
  }
  const debugState = { ...state, debugInfo };
  const debugInputs = getDebugInputs(debugState);
  if (!shallowEqual(prevDebugInputs, debugInputs)) {
    renderDebug(ui.debug, debugState);
    prevDebugInputs = debugInputs;
  }
}
function animateCamera(target) {
  const from = store.getState().camera;
  const t0 = performance.now();
  const dur = 380;
  function tick(now) {
    const p = Math.min(1, (now - t0) / dur);
    const e = p * (2 - p);
    actions.setCamera(constrainCamera({ zoom: from.zoom + (target.zoom - from.zoom) * e, x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e }, ui.canvas.clientWidth, ui.canvas.clientHeight));
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
function showHelp() {
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "helpModal";
  modal.innerHTML = '<div class="modal-card"><h2>Help</h2><p>Space pause/unpause \xB7 Right Arrow step \xB7 Ctrl+F focus search \xB7 D debug overlay.</p><button id="closeHelp">Close</button></div>';
  document.body.append(modal);
  modal.querySelector("#closeHelp").onclick = () => modal.remove();
}
function closeHelp() {
  document.getElementById("helpModal")?.remove();
}
//# sourceMappingURL=app.js.map
