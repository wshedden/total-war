export function mean(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  let sum = 0;
  let count = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    sum += value;
    count += 1;
  }
  return count ? sum / count : null;
}

export function movingAverage(values, windowSize = 1) {
  const size = Math.max(1, Number(windowSize) | 0);
  if (!Array.isArray(values) || size <= 1) return values?.slice?.() ?? [];
  const out = new Array(values.length).fill(null);
  let rollingSum = 0;
  let rollingCount = 0;
  const queue = [];
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    queue.push(value);
    if (Number.isFinite(value)) {
      rollingSum += value;
      rollingCount += 1;
    }
    if (queue.length > size) {
      const removed = queue.shift();
      if (Number.isFinite(removed)) {
        rollingSum -= removed;
        rollingCount -= 1;
      }
    }
    out[i] = rollingCount ? rollingSum / rollingCount : null;
  }
  return out;
}
