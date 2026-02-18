import { fmtCompact, fmtPercent } from '../util/format.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatValue(value, format) {
  if (!Number.isFinite(value)) return '—';
  if (format === 'percent') return fmtPercent(value);
  return fmtCompact(value);
}

function getMinMax(series) {
  let min = Infinity;
  let max = -Infinity;
  for (const item of series) {
    for (const value of item.values) {
      if (!Number.isFinite(value)) continue;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
  if (min === max) return { min: min * 0.95, max: max * 1.05 + 1e-9 };
  const pad = (max - min) * 0.1;
  return { min: min - pad, max: max + pad };
}

export function createChartCanvas(container) {
  const canvas = document.createElement('canvas');
  canvas.className = 'chart-canvas';
  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip';
  tooltip.hidden = true;
  container.append(canvas, tooltip);

  const ctx = canvas.getContext('2d');
  let hoverState = null;

  function resizeToContainer() {
    const width = Math.max(320, container.clientWidth - 12);
    const height = Math.max(220, container.clientHeight - 12);
    canvas.width = Math.floor(width * window.devicePixelRatio);
    canvas.height = Math.floor(height * window.devicePixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  }

  function drawLineChart(model) {
    resizeToContainer();
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const pad = { left: 56, right: 18, top: 18, bottom: 30 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0e1523';
    ctx.fillRect(0, 0, width, height);

    const { min, max } = getMinMax(model.series);
    const xMaxIndex = Math.max(1, model.turns.length - 1);

    ctx.strokeStyle = '#26354a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 4; i += 1) {
      const y = pad.top + (plotH * i) / 4;
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
    }
    ctx.stroke();

    ctx.strokeStyle = '#39506d';
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, height - pad.bottom);
    ctx.lineTo(width - pad.right, height - pad.bottom);
    ctx.stroke();

    ctx.fillStyle = '#9db3cc';
    ctx.font = '12px Inter, sans-serif';
    for (let i = 0; i <= 4; i += 1) {
      const y = pad.top + (plotH * i) / 4;
      const value = max - ((max - min) * i) / 4;
      ctx.fillText(formatValue(value, model.format), 8, y + 4);
    }
    if (model.turns.length) {
      ctx.fillText(`Turn ${model.turns[0]}`, pad.left, height - 8);
      ctx.fillText(`Turn ${model.turns[model.turns.length - 1]}`, width - pad.right - 64, height - 8);
    }

    for (const item of model.series) {
      ctx.strokeStyle = item.colour;
      ctx.lineWidth = item.highlight ? 2.8 : 1.7;
      ctx.beginPath();
      let started = false;
      item.values.forEach((value, i) => {
        if (!Number.isFinite(value)) return;
        const x = pad.left + (plotW * i) / xMaxIndex;
        const y = pad.top + ((max - value) / (max - min || 1)) * plotH;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    }

    hoverState = { model, pad, plotW, plotH, min, max, xMaxIndex };
  }

  function drawBars(model) {
    resizeToContainer();
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0e1523';
    ctx.fillRect(0, 0, width, height);

    const pad = { left: 44, right: 14, top: 20, bottom: 60 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const max = Math.max(1, ...model.rows.map((row) => row.value));
    const barW = plotW / Math.max(1, model.rows.length);

    ctx.strokeStyle = '#39506d';
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + plotH);
    ctx.lineTo(width - pad.right, pad.top + plotH);
    ctx.stroke();

    model.rows.forEach((row, index) => {
      const x = pad.left + index * barW + 1;
      const h = (row.value / max) * (plotH - 4);
      const y = pad.top + plotH - h;
      ctx.fillStyle = row.colour;
      ctx.fillRect(x, y, Math.max(2, barW - 3), h);
      if (index % 2 === 0) {
        ctx.fillStyle = '#9db3cc';
        ctx.font = '11px Inter, sans-serif';
        ctx.save();
        ctx.translate(x + (barW - 2) / 2, height - 48);
        ctx.rotate(-Math.PI / 3);
        ctx.fillText(row.code, 0, 0);
        ctx.restore();
      }
    });

    hoverState = null;
    tooltip.hidden = true;
  }

  canvas.addEventListener('mousemove', (event) => {
    if (!hoverState) return;
    const { model, pad, plotW, xMaxIndex } = hoverState;
    const x = clamp(event.offsetX, pad.left, pad.left + plotW);
    const index = Math.round(((x - pad.left) / plotW) * xMaxIndex);
    const lines = [];
    for (const item of model.series) {
      const value = item.values[index];
      if (!Number.isFinite(value)) continue;
      lines.push(`<div><span style="color:${item.colour}">●</span> ${item.label}: ${formatValue(value, model.format)}</div>`);
    }
    if (!lines.length) {
      tooltip.hidden = true;
      return;
    }
    tooltip.hidden = false;
    tooltip.style.left = `${event.offsetX + 14}px`;
    tooltip.style.top = `${event.offsetY + 14}px`;
    tooltip.innerHTML = `<strong>Turn ${model.turns[index] ?? '—'}</strong>${lines.join('')}`;
  });

  canvas.addEventListener('mouseleave', () => {
    tooltip.hidden = true;
  });

  return {
    drawLineChart,
    drawBars
  };
}
