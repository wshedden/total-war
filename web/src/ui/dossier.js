import { fmtCompact, fmtPercent } from '../util/format.js';
import { selectNextTurnGainHint } from '../state/selectors.js';

function relLabel(rel, tension) {
  if (rel <= -40 || tension >= 70) return 'Hostile';
  if (rel >= 40 && tension < 40) return 'Friendly';
  return 'Wary';
}

function relBar(rel) {
  const pct = ((rel + 100) / 200) * 100;
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
  if (mode === 'name') items.sort((a, b) => a.name.localeCompare(b.name));
  else items.sort((a, b) => a.rel - b.rel || b.tension - a.tension || a.code.localeCompare(b.code));
  return items;
}

export function renderDossier(node, state) {
  const selected = state.selected ? state.countryIndex[state.selected] : null;
  if (!selected) {
    const markup = '<h2>Country dossier</h2><p>Select a country to inspect key indicators.</p>';
    if (node.__lastMarkup !== markup) {
      node.innerHTML = markup;
      node.__lastMarkup = markup;
    }
    return;
  }

  if (!node.__sortMode) node.__sortMode = 'negative';
  const neighbours = sortNeighbours(selected, state, node.__sortMode);

  const dyn = state.dynamic[selected.cca3];
  const influenceHint = selectNextTurnGainHint(state, selected.cca3);
  const influenceHintText = influenceHint
    ? `+${influenceHint.gain} next turn (${influenceHint.reasons.base ? 'base' : ''}${influenceHint.reasons.stability ? ', stability' : ''}${influenceHint.reasons.topGdpPercentile ? ', top GDP' : ''})`
    : 'N/A';
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
    <div class="neighbour-head"><span>Sorted by ${node.__sortMode === 'name' ? 'name' : 'worst relations'}</span><button class="neighbour-sort" type="button">Toggle sort</button></div>
    <div class="neighbours">${neighbours.map((n) => `
      <div class="neighbour-row" title="Relationship and tension are deterministic border metrics.">
        <div class="neighbour-title"><strong>${n.code}</strong> ${n.name}</div>
        ${relBar(n.rel)}
        ${tensionBar(n.tension)}
        <div class="neighbour-meta"><span>${relLabel(n.rel, n.tension)}</span><span>Rel ${n.rel}</span><span>Tension ${n.tension}</span><span>Power ${n.powerRatio.toFixed(2)}x</span></div>
      </div>
    `).join('') || '<div class="events">No land neighbours in this dataset.</div>'}</div>
    <h3>Recent events</h3>
    <div class="events">${state.events.filter((e) => e.cca3 === selected.cca3 || e.secondary === selected.cca3).slice(0, 8).map((e) => `<div>T${e.turn}: ${e.text}${e.secondary ? ` (${e.cca3} ↔ ${e.secondary})` : ''}</div>`).join('') || '<div>None.</div>'}</div>
  `;
  if (node.__lastMarkup !== markup) {
    node.innerHTML = markup;
    node.__lastMarkup = markup;
    const sortBtn = node.querySelector('.neighbour-sort');
    if (sortBtn) {
      sortBtn.onclick = () => {
        node.__sortMode = node.__sortMode === 'name' ? 'negative' : 'name';
        node.__lastMarkup = '';
      };
    }
  }
  node.classList.toggle('open', state.dossierOpen);
}
