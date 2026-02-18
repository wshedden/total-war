export function movingAverage(values, windowSize) {
  if (!Array.isArray(values) || windowSize <= 1) return [...(values ?? [])];
  const out = new Array(values.length).fill(0);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= windowSize) sum -= values[i - windowSize];
    const count = Math.min(i + 1, windowSize);
    out[i] = sum / count;
  }
  return out;
}

export function mean(values) {
  if (!values?.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
