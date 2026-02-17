const compact = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 2 });
const num = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

export const fmtCompact = (value) => (Number.isFinite(value) ? compact.format(value) : '—');
export const fmtNumber = (value) => (Number.isFinite(value) ? num.format(value) : '—');
export const fmtPercent = (value) => (Number.isFinite(value) ? `${num.format(value)}%` : '—');
