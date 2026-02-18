import { createFloatingWindow } from './floatingWindow.js';
import { createChartCanvas } from './chartCanvas.js';
import { CHART_METRICS, getHistorySeries, getWorldTopCountries } from '../sim/historyStore.js';
import { movingAverage } from '../util/stats.js';
import { stableCountryColour } from '../map/styles.js';

const MODE_OPTIONS = [
  { value: 'selected', label: 'Selected' },
  { value: 'pinned', label: 'Pinned' },
  { value: 'world', label: 'World' },
  { value: 'region', label: 'Region' },
  { value: 'neighbours', label: 'Neighbours' }
];

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function toCountryLabel(state, code) {
  return `${state.countryIndex?.[code]?.name ?? code} (${code})`;
}

function getRegionCountryCodes(state, selected) {
  if (!selected) return [];
  const region = state.countryIndex?.[selected]?.region;
  if (!region) return [];
  return Object.keys(state.countryIndex).filter((code) => state.countryIndex[code].region === region);
}

function getNeighbourCountryCodes(state, selected) {
  if (!selected) return [];
  const neighbours = state.neighbours?.[selected] ?? [];
  return [selected, ...neighbours.slice(0, 5)];
}

function withSmoothing(series, smoothing) {
  const windowSize = smoothing === '3' ? 3 : smoothing === '7' ? 7 : 1;
  return series.map((item) => ({ ...item, values: movingAverage(item.values, windowSize) }));
}

export function createChartsWindow({ parent, actions, getState }) {
  const panel = el('div', 'charts-panel');

  const controls = el('div', 'charts-controls');
  const modeSelect = el('select');
  MODE_OPTIONS.forEach((option) => {
    const node = el('option');
    node.value = option.value;
    node.textContent = option.label;
    modeSelect.append(node);
  });

  const metricSelect = el('select');
  Object.entries(CHART_METRICS).forEach(([value, meta]) => {
    const node = el('option');
    node.value = value;
    node.textContent = meta.label;
    metricSelect.append(node);
  });

  const rangeSelect = el('select');
  rangeSelect.innerHTML = '<option value="50">Last 50 turns</option><option value="200">Last 200 turns</option><option value="stored">All stored</option>';
  const smoothingSelect = el('select');
  smoothingSelect.innerHTML = '<option value="none">No smoothing</option><option value="3">3-turn moving average</option><option value="7">7-turn moving average</option>';

  controls.append(modeSelect, metricSelect, rangeSelect, smoothingSelect);

  const pinnedWrap = el('div', 'charts-pinned');
  const chartWrap = el('div', 'charts-canvas-wrap');
  panel.append(controls, pinnedWrap, chartWrap);

  const floating = createFloatingWindow({
    parent,
    title: 'Charts',
    state: getState().charts.window,
    onStateChange: (windowState) => actions.setChartsWindowState(windowState),
    onClose: () => actions.setChartsWindowOpen(false)
  });
  floating.body.append(panel);

  const canvas = createChartCanvas(chartWrap);

  function renderPinned(state) {
    pinnedWrap.innerHTML = '';
    const title = el('div', 'charts-pinned__title');
    title.textContent = 'Pinned countries';
    pinnedWrap.append(title);
    if (!state.charts.pinned.length) {
      const empty = el('div', 'charts-pinned__empty');
      empty.textContent = 'No countries pinned yet.';
      pinnedWrap.append(empty);
      return;
    }
    for (const code of state.charts.pinned) {
      const tag = el('button', 'charts-tag');
      tag.type = 'button';
      tag.style.borderColor = stableCountryColour(code, state.seed);
      tag.textContent = code;
      tag.title = toCountryLabel(state, code);
      tag.onclick = () => actions.unpinCountryFromCharts(code);
      pinnedWrap.append(tag);
    }
  }

  function resolveCodesForMode(state) {
    const selected = state.selected;
    if (state.charts.mode === 'selected') return selected ? [selected] : [];
    if (state.charts.mode === 'pinned') return state.charts.pinned;
    if (state.charts.mode === 'region') return getRegionCountryCodes(state, selected).slice(0, 6);
    if (state.charts.mode === 'neighbours') return getNeighbourCountryCodes(state, selected);
    return selected ? [selected] : [];
  }

  function renderChart(state) {
    floating.setState(state.charts.window);
    modeSelect.value = state.charts.mode;
    metricSelect.value = state.charts.metric;
    rangeSelect.value = state.charts.range;
    smoothingSelect.value = state.charts.smoothing;
    renderPinned(state);

    if (!state.charts.window.open) return;

    if (state.charts.mode === 'world') {
      const rows = getWorldTopCountries(state, state.charts.metric, 20)
        .map((row) => ({ ...row, colour: stableCountryColour(row.code, state.seed) }));
      canvas.drawBars({ rows });
      return;
    }

    const codes = resolveCodesForMode(state);
    const { turns, series } = getHistorySeries(state.history, state.charts.metric, codes, state.charts.range);
    const smoothed = withSmoothing(series, state.charts.smoothing);
    const lineSeries = smoothed.map((item) => ({
      ...item,
      label: toCountryLabel(state, item.code),
      colour: stableCountryColour(item.code, state.seed),
      highlight: item.code === state.selected
    }));
    canvas.drawLineChart({
      turns,
      series: lineSeries,
      format: CHART_METRICS[state.charts.metric]?.format ?? 'number'
    });
  }

  modeSelect.onchange = () => actions.setChartsMode(modeSelect.value);
  metricSelect.onchange = () => actions.setChartsMetric(metricSelect.value);
  rangeSelect.onchange = () => actions.setChartsRange(rangeSelect.value);
  smoothingSelect.onchange = () => actions.setChartsSmoothing(smoothingSelect.value);

  return {
    render: renderChart
  };
}
