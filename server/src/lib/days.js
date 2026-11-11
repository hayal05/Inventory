// Day helpers for GET /api/dashboard/daily. Days are 'YYYY-MM-DD' strings in UTC, like the
// other date helpers (lib/expiry.js, lib/months.js).
import { addDays } from './expiry.js';

// The last `count` days ending with `today`, oldest first.
export function lastDays(today, count) {
  const keys = [];
  for (let i = count - 1; i >= 0; i--) keys.push(addDays(today, -i));
  return keys;
}

// One item per day key, in order. Days without any row become { movements: 0 }, so the chart
// has no gaps. Rows for days outside `keys` are ignored.
export function fillDays(keys, rows) {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return keys.map((date) => ({ date, movements: byDay.has(date) ? Number(byDay.get(date).movements) : 0 }));
}
