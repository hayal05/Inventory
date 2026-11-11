// Date helpers for the expiring report. All dates are 'YYYY-MM-DD' strings in UTC, the same
// convention as FEFO (lib/fefo.js), so both agree on what "expired" means.
const DAY_MS = 86_400_000;
const toMs = (s) => Date.parse(`${s}T00:00:00Z`);

// The date `days` after `today`.
export const addDays = (today, days) => new Date(toMs(today) + days * DAY_MS).toISOString().slice(0, 10);

// Whole days from `today` to `expiryDate`: 0 = expires today, negative = already expired.
export const daysLeft = (today, expiryDate) => Math.round((toMs(expiryDate) - toMs(today)) / DAY_MS);
