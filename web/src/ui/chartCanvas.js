import { fmtCompact, fmtPercent } from '../util/format.js';

function formatValue(value, format) {
  if (format === 'percent') return fmtPercent(value);
  if (format === 'compact') return fmtCompact(value);
  return value.toFixed(2);
}

function toCanvasSize(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height, ratio };
}

export function createChartCanvas(canvas, tooltipNode) {
  let model = null;

  function draw() {
    if (!model) return;
    const { width, height, ratio } = toCanvasSize(canvas);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const w = width / ratio;
    const h = height / ratio;
    ctx.clearRect(0, 0, w, h);

    const pad = { l: 54, t: 20, r: 18, b: 34 };
    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;

    ctx.fillStyle = '#0f1622';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#2c3c55';
    ctx.lineWidth = 1;

    const min = model.yMin;
    const max = model.yMax <= min ? min + 1 : model.yMax;

    for (let i = 0; i <= 4; i += 1) {
      const y = pad.t + (plotH * i) / 4;
      ctx.strokeStyle = '#223247';
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + plotW, y);
      ctx.stroke();

      const value = max - ((max - min) * i) / 4;
      ctx.fillStyle = '#a7b8cd';
      ctx.font = '12px Inter, Segoe UI, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(formatValue(value, model.metricFormat), pad.l - 6, y + 4);
    }

    if (model.type === 'line') {
      for (const series of model.series) {
        if (!series.values.length) continue;
        ctx.strokeStyle = series.colour;
        ctx.lineWidth = series.highlight ? 2.8 : 1.7;
        ctx.beginPath();
        for (let i = 0; i < series.values.length; i += 1) {
          const x = pad.l + (plotW * i) / Math.max(1, series.values.length - 1);
          const yNorm = (series.values[i] - min) / (max - min || 1);
          const y = pad.t + plotH - yNorm * plotH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      ctx.fillStyle = '#9eb2cc';
      ctx.font = '12px Inter, Segoe UI, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(model.xLabel ?? 'Turn', pad.l, h - 8);
    } else if (model.type === 'bar') {
      const barWidth = plotW / Math.max(1, model.bars.length);
      model.bars.forEach((bar, i) => {
        const x = pad.l + i * barWidth + 2;
        const norm = (bar.value - min) / (max - min || 1);
        const barH = Math.max(2, norm * plotH);
        const y = pad.t + plotH - barH;
        ctx.fillStyle = bar.colour;
        ctx.fillRect(x, y, Math.max(2, barWidth - 4), barH);
      });
    }

    ctx.fillStyle = '#d8e4f2';
    ctx.font = '13px Inter, Segoe UI, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(model.title, pad.l, 14);
  }

  function setTooltip(payload, x, y) {
    if (!payload) {
      tooltipNode.hidden = true;
      return;
    }
    tooltipNode.hidden = false;
    tooltipNode.style.left = `${x + 16}px`;
    tooltipNode.style.top = `${y + 16}px`;
    tooltipNode.innerHTML = payload;
  }

  canvas.addEventListener('mouseleave', () => setTooltip(null));
  canvas.addEventListener('mousemove', (event) => {
    if (!model) return;
    if (model.type === 'line' && model.series.length) {
      const rect = canvas.getBoundingClientRect();
      const relX = event.clientX - rect.left;
      const idx = Math.round((relX / Math.max(1, rect.width)) * Math.max(0, model.turns.length - 1));
      if (idx < 0 || idx >= model.turns.length) return setTooltip(null);
      const lines = [`<strong>Turn ${model.turns[idx]}</strong>`];
      for (const series of model.series.slice(0, 8)) {
        const val = series.values[idx];
        if (!Number.isFinite(val)) continue;
        lines.push(`<div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${series.colour};margin-right:6px"></span>${series.label}: ${formatValue(val, model.metricFormat)}</div>`);
      }
      setTooltip(lines.join(''), event.clientX, event.clientY);
    } else if (model.type === 'bar' && model.bars.length) {
      const rect = canvas.getBoundingClientRect();
      const relX = event.clientX - rect.left;
      const idx = Math.floor((relX / Math.max(1, rect.width)) * model.bars.length);
      const bar = model.bars[idx];
      if (!bar) return setTooltip(null);
      setTooltip(`<strong>${bar.label}</strong><div>${formatValue(bar.value, model.metricFormat)}</div>`, event.clientX, event.clientY);
    }
  });

  return {
    render(nextModel) {
      model = nextModel;
      draw();
    }
  };
}
