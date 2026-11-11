// Month helpers for GET /api/dashboard/monthly. Months are 'YYYY-MM' strings in UTC, the same
// convention as the other date helpers (lib/expiry.js, lib/fefo.js).

// The last `count` months ending with the month of `today` ('YYYY-MM-DD'), oldest first.
export function lastMonths(today, count) {
  const [y, m] = today.split('-').map(Number);
  const keys = [];
  for (let i = count - 1; i >= 0; i--) {
    const idx = y * 12 + (m - 1) - i; // months since year 0
    keys.push(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`);
  }
  return keys;
}

// First moment of a month key, as a Date (UTC).
export const monthStart = (key) => new Date(`${key}-01T00:00:00Z`);

// One item per month key, in order. Months without any row become { received: 0, issued: 0 },
// so the chart has no gaps. Rows for months outside `keys` are ignored.
export function fillMonths(keys, rows) {
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return keys.map((month) => {
    const r = byMonth.get(month);
    return { month, received: r ? Number(r.received) : 0, issued: r ? Number(r.issued) : 0 };
  });
}
