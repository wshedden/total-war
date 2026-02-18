import { el } from '../util/dom.js';
import { stableCountryColour } from '../map/styles.js';
import { movingAverage, mean } from '../util/stats.js';
import { CHART_METRICS, getCountryMetricSeries, getHistoryTurns, getTopCountriesForMetric } from '../sim/historyStore.js';
import { createChartCanvas } from './chartCanvas.js';
import { createFloatingWindow } from './floatingWindow.js';

function metricByKey(key) {
  return CHART_METRICS.find((metric) => metric.key === key) ?? CHART_METRICS[0];
}

function applySmoothing(values, smoothing) {
  if (smoothing === '3') return movingAverage(values, 3);
  if (smoothing === '7') return movingAverage(values, 7);
  return values;
}

function regionAverageSeries(state, turns, metric, range) {
  const selected = state.selected;
  const region = selected ? state.countryIndex?.[selected]?.region : null;
  if (!region) return null;
  const regionCodes = Object.keys(state.countryIndex).filter((code) => state.countryIndex[code]?.region === region);
  if (!regionCodes.length) return null;
  return turns.map((_, idx) => mean(regionCodes.map((code) => getCountryMetricSeries(state.history, code, metric, range)[idx] ?? 0)));
}

function neighbourAverageSeries(state, turns, metric, range) {
  const selected = state.selected;
  if (!selected) return null;
  const neighbours = state.neighbours?.[selected] ?? [];
  if (!neighbours.length) return null;
  return turns.map((_, idx) => mean(neighbours.map((code) => getCountryMetricSeries(state.history, code, metric, range)[idx] ?? 0)));
}

export function createChartsWindow(hostNode, store, actions) {
  const panel = el('div', 'charts-window');
  const controls = el('div', 'charts-controls');
  const mode = el('select', 'charts-control');
  mode.innerHTML = `
    <option value="selected">Selected</option>
    <option value="pinned">Pinned</option>
    <option value="world">World Top 20</option>
    <option value="region">Region average</option>
    <option value="neighbours">Neighbours</option>
  `;
  const metricSelect = el('select', 'charts-control');
  metricSelect.innerHTML = CHART_METRICS.map((metric) => `<option value="${metric.key}">${metric.label}</option>`).join('');
  const range = el('select', 'charts-control');
  range.innerHTML = '<option value="50">Last 50 turns</option><option value="200">Last 200 turns</option><option value="all">All stored</option>';
  const smoothing = el('select', 'charts-control');
  smoothing.innerHTML = '<option value="none">Smoothing: none</option><option value="3">Smoothing: 3-turn</option><option value="7">Smoothing: 7-turn</option>';

  const pinSelected = el('button', '', 'Pin selected');
  pinSelected.type = 'button';

  const tags = el('div', 'chart-tags');

  controls.append(mode, metricSelect, range, smoothing, pinSelected);

  const canvasWrap = el('div', 'chart-canvas-wrap');
  const canvas = el('canvas', 'chart-canvas');
  const tooltip = el('div', 'chart-tooltip');
  tooltip.hidden = true;
  canvasWrap.append(canvas, tooltip);
  panel.append(controls, tags, canvasWrap);

  const floating = createFloatingWindow(hostNode, {
    title: 'Charts',
    zIndex: 28,
    minWidth: 520,
    minHeight: 340,
    getState: () => store.getState().chartsWindow,
    onClose: () => actions.setChartsWindow({ open: false }),
    onFocus: () => actions.setChartsWindow({ zIndex: 28 }),
    onChange: (nextState) => actions.setChartsWindow(nextState)
  });
  floating.content.append(panel);

  const chart = createChartCanvas(canvas, tooltip);

  function syncControlValues(state) {
    mode.value = state.chartControls.mode;
    metricSelect.value = state.chartControls.metric;
    range.value = state.chartControls.range;
    smoothing.value = state.chartControls.smoothing;
  }

  function buildLineModel(state) {
    const turns = getHistoryTurns(state.history, state.chartControls.range);
    const metric = state.chartControls.metric;
    const metricConfig = metricByKey(metric);
    const selected = state.selected;
    const codes = [];

    if (state.chartControls.mode === 'selected' && selected) codes.push(selected);
    if (state.chartControls.mode === 'pinned') codes.push(...state.chartPinned);
    if (state.chartControls.mode !== 'pinned' && state.chartControls.mode !== 'selected') {
      if (selected) codes.push(selected);
      for (const code of state.chartPinned) if (!codes.includes(code)) codes.push(code);
    }

    const series = codes
      .filter((code) => state.countryIndex?.[code])
      .map((code) => {
        const values = getCountryMetricSeries(state.history, code, metric, state.chartControls.range);
        return {
          code,
          label: state.countryIndex[code]?.name ?? code,
          colour: stableCountryColour(code, state.seed),
          highlight: code === selected,
          values: applySmoothing(values, state.chartControls.smoothing)
        };
      })
      .filter((entry) => entry.values.length);

    if (state.chartControls.mode === 'region') {
      const regionValues = applySmoothing(regionAverageSeries(state, turns, metric, state.chartControls.range) ?? [], state.chartControls.smoothing);
      if (regionValues.length) series.push({ code: 'region', label: 'Region average', colour: '#ffd166', highlight: false, values: regionValues });
    }
    if (state.chartControls.mode === 'neighbours') {
      const nValues = applySmoothing(neighbourAverageSeries(state, turns, metric, state.chartControls.range) ?? [], state.chartControls.smoothing);
      if (nValues.length) series.push({ code: 'neighbourAvg', label: 'Neighbour average', colour: '#5ec2ff', highlight: false, values: nValues });
    }

    const allValues = series.flatMap((entry) => entry.values);
    const yMin = Math.min(...allValues, 0);
    const yMax = Math.max(...allValues, 1);
    return {
      type: 'line',
      title: `${metricConfig.label} by turn`,
      turns,
      metricFormat: metricConfig.format,
      series,
      yMin,
      yMax,
      xLabel: 'Turn'
    };
  }

  function buildBarModel(state) {
    const metric = state.chartControls.metric;
    const metricConfig = metricByKey(metric);
    const top = getTopCountriesForMetric(state, metric, 20);
    const values = top.map((entry) => entry.value);
    return {
      type: 'bar',
      title: `World top 20 · ${metricConfig.label}`,
      metricFormat: metricConfig.format,
      yMin: 0,
      yMax: Math.max(...values, 1),
      bars: top.map((entry) => ({
        label: `${entry.label} (${entry.code})`,
        value: entry.value,
        colour: stableCountryColour(entry.code, state.seed)
      }))
    };
  }

  function renderPinnedTags(state) {
    tags.innerHTML = '';
    for (const code of state.chartPinned) {
      const tag = el('button', 'chart-tag', `${state.countryIndex?.[code]?.name ?? code} ✕`);
      tag.type = 'button';
      tag.style.borderColor = stableCountryColour(code, state.seed);
      tag.onclick = () => actions.unpinCountry(code);
      tags.append(tag);
    }
  }

  function render(state) {
    syncControlValues(state);
    floating.render(state.chartsWindow);
    if (!state.chartsWindow.open) return;

    renderPinnedTags(state);
    const model = state.chartControls.mode === 'world' ? buildBarModel(state) : buildLineModel(state);
    chart.render(model);
  }

  mode.onchange = () => actions.setChartControls({ mode: mode.value });
  metricSelect.onchange = () => actions.setChartControls({ metric: metricSelect.value });
  range.onchange = () => actions.setChartControls({ range: range.value });
  smoothing.onchange = () => actions.setChartControls({ smoothing: smoothing.value });
  pinSelected.onclick = () => {
    const selected = store.getState().selected;
    if (selected) actions.pinCountry(selected);
  };

  return { render };
}
