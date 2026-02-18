import { fmtCompact, fmtPercent } from '../util/format.js';

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
  const dyn = state.dynamic[selected.cca3];
  const markup = `
    <h2>${selected.name}</h2>
    <p>${selected.officialName}</p>
    <div class="metric"><span>Code</span><strong>${selected.cca3}</strong></div>
    <div class="metric"><span>Region</span><strong>${selected.region}</strong></div>
    <div class="metric"><span>Population</span><strong>${fmtCompact(selected.population)}</strong></div>
    <div class="metric"><span>GDP (sim)</span><strong>${fmtCompact(dyn.gdp)}</strong></div>
    <div class="metric"><span>Military % GDP</span><strong>${fmtPercent(dyn.militaryPct)}</strong></div>
    <h3>Recent events</h3>
    <div class="events">${state.events.filter((e) => e.cca3 === selected.cca3).slice(0, 8).map((e) => `<div>T${e.turn}: ${e.text}</div>`).join('') || '<div>None.</div>'}</div>
  `;
  if (node.__lastMarkup !== markup) {
    node.innerHTML = markup;
    node.__lastMarkup = markup;
  }
  node.classList.toggle('open', state.dossierOpen);
}
