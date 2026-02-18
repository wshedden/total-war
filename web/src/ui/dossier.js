import { fmtCompact, fmtPercent } from '../util/format.js';
import { ACTION_DEFINITIONS, checkActionPreconditions } from '../state/diplomaticActions.js';
import { selectNextTurnGainHint } from '../state/selectors.js';

const STANCE_OPTIONS = [
  { value: 'conciliatory', label: 'Conciliatory' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'hardline', label: 'Hardline' }
];

function relLabel(rel, tension) {
  if (rel <= -40 || tension >= 70) return 'Hostile';
  if ((rel >= -20 && rel <= 39) || (tension >= 40 && tension <= 69)) return 'Wary';
  return rel >= 40 && tension < 40 ? 'Friendly' : 'Wary';
}

function relBar(rel) {
  const pct = ((rel + 100) / 200) * 100;
  return `<div class="rel-bar" title="Relationship -100 to 100"><i style="width:${pct.toFixed(1)}%"></i></div>`;
}

function tensionBar(tension) {
  return `<div class="tense-bar" title="Border tension 0 to 100"><i style="width:${tension}%"></i></div>`;
}

function trustBar(trust) {
  return `<div class="trust-bar" title="Trust 0 to 100"><i style="width:${trust}%"></i></div>`;
}

const NEIGHBOUR_SORT_MODES = [
  { value: 'worst-relationship', label: 'worst relationship' },
  { value: 'highest-tension', label: 'highest tension' },
  { value: 'alphabetical', label: 'alphabetical' }
];

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
  if (mode === 'alphabetical') items.sort((a, b) => a.name.localeCompare(b.name));
  else if (mode === 'highest-tension') items.sort((a, b) => b.tension - a.tension || a.rel - b.rel || a.name.localeCompare(b.name));
  else items.sort((a, b) => a.rel - b.rel || b.tension - a.tension || a.name.localeCompare(b.name));
  return items;
}

function formatInfluenceHint(influenceHint) {
  if (!influenceHint) return 'N/A';
  const reasons = [];
  if (influenceHint.reasons.base) reasons.push('base');
  if (influenceHint.reasons.stability) reasons.push('stability');
  if (influenceHint.reasons.topGdpPercentile) reasons.push('top GDP');
  return `+${influenceHint.gain} next turn (${reasons.join(', ') || 'none'})`;
}

function reasonLabel(reason, cooldownTurns = 0, influence = 0, cost = 0) {
  if (reason === 'actor-already-used-action-this-turn') return 'Action already used this turn.';
  if (reason === 'insufficient-influence') return `Need ${cost} influence, have ${influence}.`;
  if (reason === 'action-on-cooldown') return `On cooldown (${cooldownTurns} turn${cooldownTurns === 1 ? '' : 's'} remaining).`;
  if (!reason) return '';
  return `Precondition failed: ${reason.replaceAll('-', ' ')}.`;
}

function getActionUiState(state, actor, target, type) {
  const cooldownTurns = state.dynamic?.[actor]?.cooldowns?.[type] ?? 0;
  const queued = state.queuedPlayerAction;
  if (queued && queued.actor === actor && queued.target === target && queued.type === type) {
    return { disabled: true, reason: 'actor-already-used-action-this-turn', cooldownTurns, queued: true };
  }

  const check = checkActionPreconditions(state, { actor, target, type, source: 'player' });
  return {
    disabled: !check.ok,
    reason: check.reason,
    cooldownTurns,
    queued: false
  };
}

function buildDiplomaticButtons(state, actorCode, targetCode, influence) {
  if (!targetCode) return '<div class="events">No land neighbours in this dataset.</div>';
  return Object.values(ACTION_DEFINITIONS).map((definition) => {
    const uiState = getActionUiState(state, actorCode, targetCode, definition.type);
    const disabledReason = reasonLabel(uiState.reason, uiState.cooldownTurns, influence, definition.cost);
    return `
      <div class="dip-action-row">
        <button
          class="dip-action"
          type="button"
          data-action-type="${definition.type}"
          ${uiState.disabled ? 'disabled' : ''}
          title="Influence cost: ${definition.cost}"
        >
          ${definition.type}${uiState.queued ? ' (Queued)' : ''}
          <span class="dip-cost">-${definition.cost} inf</span>
        </button>
        <div class="dip-action-meta">
          ${uiState.cooldownTurns > 0 ? `<span class="dip-cooldown">Cooldown: ${uiState.cooldownTurns}t</span>` : '<span class="dip-cooldown dip-cooldown-ready">Ready</span>'}
          ${uiState.disabled ? `<span class="dip-disabled-reason">${disabledReason}</span>` : '<span class="dip-disabled-reason dip-disabled-reason-ready">Available this turn.</span>'}
        </div>
      </div>
    `;
  }).join('');
}

export function renderDossier(node, state, actions, onUiStateChange = null) {
  const selected = state.selected ? state.countryIndex[state.selected] : null;
  if (!selected) {
    const markup = '<h2>Country dossier</h2><p>Select a country to inspect key indicators.</p>';
    if (node.__lastMarkup !== markup) {
      node.innerHTML = markup;
      node.__lastMarkup = markup;
    }
    return;
  }

  if (!node.__sortMode) node.__sortMode = 'worst-relationship';
  const neighbours = sortNeighbours(selected, state, node.__sortMode);

  const dyn = state.dynamic[selected.cca3];
  const influenceHint = selectNextTurnGainHint(state, selected.cca3);
  const influenceHintText = formatInfluenceHint(influenceHint);
  const policy = dyn.policy ?? {};
  const activeNeighbour = neighbours.find((item) => item.code === node.__diplomacyTarget) ?? neighbours[0] ?? null;
  if (activeNeighbour) node.__diplomacyTarget = activeNeighbour.code;

  const diplomaticButtons = buildDiplomaticButtons(state, selected.cca3, activeNeighbour?.code, dyn.influence);

  const markup = `
    <h2>${selected.name}</h2>
    <p>${selected.officialName}</p>
    <div class="metric"><span>Turn</span><strong data-dossier-turn>${state.turn}</strong></div>
    <div class="metric"><span>Code</span><strong>${selected.cca3}</strong></div>
    <div class="metric"><span>Region</span><strong>${selected.region}</strong></div>
    <div class="metric"><span>Population</span><strong>${fmtCompact(selected.population)}</strong></div>
    <div class="metric"><span>GDP (sim)</span><strong data-dossier-gdp>${fmtCompact(dyn.gdp)}</strong></div>
    <div class="metric"><span>Military % GDP</span><strong data-dossier-military>${fmtPercent(dyn.militaryPct)}</strong></div>
    <div class="metric"><span>Stability</span><strong data-dossier-stability>${fmtPercent(dyn.stability)}</strong></div>
    <div class="metric"><span>Influence</span><strong data-dossier-influence>${fmtCompact(dyn.influence)}</strong></div>
    <div class="metric" title="Projected influence gain next turn."><span>Influence gain hint</span><strong data-dossier-influence-hint>${influenceHintText}</strong></div>
    <div class="metric"><span>Power</span><strong data-dossier-power>${fmtCompact(dyn.power)}</strong></div>
    <div class="dossier-chart-actions">
      <button type="button" data-chart-open>Open charts</button>
      <button type="button" data-chart-pin>Pin to charts</button>
    </div>

    <h3>Policy controls</h3>
    <div class="policy-controls">
      <div class="policy-row">
        <label for="policy-military">Military target (% GDP)</label>
        <div class="policy-stepper">
          <button class="policy-step" type="button" data-policy-step="-0.01">−</button>
          <input id="policy-military" class="policy-input policy-range" type="range" min="0.5" max="0.83" step="0.01" value="${policy.milTargetPct ?? 0.6}" data-policy-field="milTargetPct" />
          <button class="policy-step" type="button" data-policy-step="0.01">+</button>
          <input class="policy-input policy-number" type="number" min="0.5" max="0.83" step="0.01" value="${policy.milTargetPct ?? 0.6}" data-policy-field="milTargetPct" />
        </div>
      </div>
      <div class="policy-row">
        <label for="policy-growth">Growth focus (${policy.growthFocus ?? 50})</label>
        <input id="policy-growth" class="policy-input policy-range" type="range" min="0" max="100" step="1" value="${policy.growthFocus ?? 50}" data-policy-field="growthFocus" />
      </div>
      <div class="policy-row">
        <label for="policy-stability">Stability focus (${policy.stabilityFocus ?? 50})</label>
        <input id="policy-stability" class="policy-input policy-range" type="range" min="0" max="100" step="1" value="${policy.stabilityFocus ?? 50}" data-policy-field="stabilityFocus" />
      </div>
      <div class="policy-row">
        <label for="policy-stance">Stance</label>
        <select id="policy-stance" class="policy-input" data-policy-field="stance">
          ${STANCE_OPTIONS.map((item) => `<option value="${item.value}" ${policy.stance === item.value ? 'selected' : ''}>${item.label}</option>`).join('')}
        </select>
      </div>
    </div>

    <h3>Diplomatic actions</h3>
    <div class="dip-targets">
      ${neighbours.map((item) => `<button type="button" class="dip-target ${activeNeighbour?.code === item.code ? 'active' : ''}" data-target="${item.code}">${item.code}</button>`).join('') || '<div class="events">No valid targets.</div>'}
    </div>
    ${activeNeighbour ? `<div class="dip-target-name" data-dossier-target-name>Target: ${activeNeighbour.name} (${activeNeighbour.code})</div>` : ''}
    <div class="dip-actions" data-dossier-actions>${diplomaticButtons}</div>

    <h3>Neighbours</h3>
    <div class="neighbour-head">
      <label for="neighbour-sort" class="neighbour-sort-label">Sort by</label>
      <select id="neighbour-sort" class="neighbour-sort" data-neighbour-sort>
        ${NEIGHBOUR_SORT_MODES.map((mode) => `<option value="${mode.value}" ${node.__sortMode === mode.value ? 'selected' : ''}>${mode.label}</option>`).join('')}
      </select>
    </div>
    <div class="neighbours" data-dossier-neighbours>${neighbours.map((n) => `
      <div class="neighbour-row" title="Relationship and tension are deterministic border metrics.">
        <div class="neighbour-title"><strong>${n.code}</strong> ${n.name}</div>
        ${relBar(n.rel)}
        ${tensionBar(n.tension)}
        ${trustBar(n.trust)}
        <div class="neighbour-meta"><span>Posture: ${relLabel(n.rel, n.tension)}</span><span>Rel ${n.rel}</span><span>Tension ${n.tension}</span><span>Trust ${n.trust}</span><span>Power ${n.powerRatio.toFixed(2)}x</span></div>
      </div>
    `).join('') || '<div class="events">No land neighbours in this dataset.</div>'}</div>
    <h3>Recent events</h3>
    <div class="events" data-dossier-events>${state.events.filter((e) => e.cca3 === selected.cca3 || e.secondary === selected.cca3).slice(0, 8).map((e) => `<div>T${e.turn}: ${e.text}${e.secondary ? ` (${e.cca3} ↔ ${e.secondary})` : ''}</div>`).join('') || '<div>None.</div>'}</div>
  `;

  if (node.__lastMarkup !== markup) {
    node.innerHTML = markup;
    node.__lastMarkup = markup;

    const sortSelect = node.querySelector('[data-neighbour-sort]');
    if (sortSelect) {
      sortSelect.onchange = (event) => {
        node.__sortMode = event.currentTarget.value;
        node.__lastMarkup = '';
        onUiStateChange?.();
      };
    }

    node.querySelectorAll('[data-policy-field]').forEach((input) => {
      const field = input.getAttribute('data-policy-field');
      const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
      input.addEventListener(eventName, (event) => {
        actions.setPolicyField(field, event.currentTarget.value, selected.cca3);
      });
    });

    node.querySelectorAll('[data-policy-step]').forEach((btn) => {
      btn.onclick = () => {
        const delta = Number(btn.getAttribute('data-policy-step'));
        const current = Number(state.dynamic?.[selected.cca3]?.policy?.milTargetPct ?? 0.6);
        actions.setPolicyField('milTargetPct', current + delta, selected.cca3);
      };
    });

    node.querySelectorAll('[data-target]').forEach((btn) => {
      btn.onclick = () => {
        node.__diplomacyTarget = btn.getAttribute('data-target');
        node.__lastMarkup = '';
        onUiStateChange?.();
      };
    });

    node.querySelectorAll('[data-action-type]').forEach((btn) => {
      btn.onclick = () => {
        if (!node.__diplomacyTarget) return;
        actions.queuePlayerDiplomaticAction(btn.getAttribute('data-action-type'), node.__diplomacyTarget, selected.cca3);
      };
    });

    const chartOpen = node.querySelector('[data-chart-open]');
    if (chartOpen) chartOpen.onclick = () => actions.setChartsWindow({ open: true });
    const chartPin = node.querySelector('[data-chart-pin]');
    if (chartPin) chartPin.onclick = () => actions.pinCountry(selected.cca3);
  }

  node.classList.toggle('open', state.dossierOpen);
}

export function updateDossierLiveTelemetry(node, state, actions = null) {
  const selectedCode = state.selected;
  if (!selectedCode || !node.querySelector('[data-dossier-events]')) return;

  const turnValue = node.querySelector('[data-dossier-turn]');
  if (turnValue) turnValue.textContent = String(state.turn);

  const selected = state.countryIndex[selectedCode];
  if (!selected) return;

  const dyn = state.dynamic[selectedCode];
  if (dyn) {
    const influenceHint = selectNextTurnGainHint(state, selectedCode);
    const gdpValue = node.querySelector('[data-dossier-gdp]');
    if (gdpValue) gdpValue.textContent = fmtCompact(dyn.gdp);
    const militaryValue = node.querySelector('[data-dossier-military]');
    if (militaryValue) militaryValue.textContent = fmtPercent(dyn.militaryPct);
    const stabilityValue = node.querySelector('[data-dossier-stability]');
    if (stabilityValue) stabilityValue.textContent = fmtPercent(dyn.stability);
    const influenceValue = node.querySelector('[data-dossier-influence]');
    if (influenceValue) influenceValue.textContent = fmtCompact(dyn.influence);
    const hintValue = node.querySelector('[data-dossier-influence-hint]');
    if (hintValue) hintValue.textContent = formatInfluenceHint(influenceHint);
    const powerValue = node.querySelector('[data-dossier-power]');
    if (powerValue) powerValue.textContent = fmtCompact(dyn.power);
  }

  const neighboursNode = node.querySelector('[data-dossier-neighbours]');
  const neighbours = sortNeighbours(selected, state, node.__sortMode || 'worst-relationship');
  const activeNeighbour = neighbours.find((item) => item.code === node.__diplomacyTarget) ?? neighbours[0] ?? null;
  if (activeNeighbour) node.__diplomacyTarget = activeNeighbour.code;

  const targetNameNode = node.querySelector('[data-dossier-target-name]');
  if (targetNameNode && activeNeighbour) {
    targetNameNode.textContent = `Target: ${activeNeighbour.name} (${activeNeighbour.code})`;
  }

  const actionsNode = node.querySelector('[data-dossier-actions]');
  if (actionsNode) {
    const influence = state.dynamic?.[selectedCode]?.influence ?? 0;
    actionsNode.innerHTML = buildDiplomaticButtons(state, selectedCode, activeNeighbour?.code, influence);
    if (actions) {
      actionsNode.querySelectorAll('[data-action-type]').forEach((btn) => {
        btn.onclick = () => {
          if (!node.__diplomacyTarget) return;
          actions.queuePlayerDiplomaticAction(btn.getAttribute('data-action-type'), node.__diplomacyTarget, selectedCode);
        };
      });
    }
  }

  if (neighboursNode) {
    neighboursNode.innerHTML = neighbours.map((n) => `
      <div class="neighbour-row" title="Relationship and tension are deterministic border metrics.">
        <div class="neighbour-title"><strong>${n.code}</strong> ${n.name}</div>
        ${relBar(n.rel)}
        ${tensionBar(n.tension)}
        ${trustBar(n.trust)}
        <div class="neighbour-meta"><span>Posture: ${relLabel(n.rel, n.tension)}</span><span>Rel ${n.rel}</span><span>Tension ${n.tension}</span><span>Trust ${n.trust}</span><span>Power ${n.powerRatio.toFixed(2)}x</span></div>
      </div>
    `).join('') || '<div class="events">No land neighbours in this dataset.</div>';
  }

  const eventsNode = node.querySelector('[data-dossier-events]');
  if (eventsNode) {
    eventsNode.innerHTML = state.events
      .filter((e) => e.cca3 === selected.cca3 || e.secondary === selected.cca3)
      .slice(0, 8)
      .map((e) => `<div>T${e.turn}: ${e.text}${e.secondary ? ` (${e.cca3} ↔ ${e.secondary})` : ''}</div>`)
      .join('') || '<div>None.</div>';
  }
}
