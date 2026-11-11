// Percent change from `previous` to `current`, rounded to 1 decimal.
// previous = 0 has no percentage: null if the value grew from nothing, 0 if it stayed 0.
// Inputs may be numbers or numeric strings (money arrives as exact strings); this is for display only.
export function pctChange(current, previous) {
  const c = Number(current);
  const p = Number(previous);
  if (!Number.isFinite(c) || !Number.isFinite(p)) return null;
  if (p === 0) return c === 0 ? 0 : null;
  return Math.round(((c - p) / Math.abs(p)) * 1000) / 10;
}
