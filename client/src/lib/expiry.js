// Expiry colour and wording, shared by the dashboard panel and the product pages.
// Colour rule from docs/ui-guide.md: red if expired or under 30 days, amber under 60, neutral otherwise.
export function expiryVariant(daysLeft) {
  if (daysLeft < 30) return 'down';
  if (daysLeft < 60) return 'warn';
  return 'neutral';
}

export function expiryLabel(daysLeft) {
  if (daysLeft < 0) return `Expired ${-daysLeft}d ago`;
  if (daysLeft === 0) return 'Expires today';
  return `${daysLeft}d left`;
}

// Whole days from today (UTC date, like the server) to an expiry date 'YYYY-MM-DD'; negative = already expired.
export function daysUntil(date, today = new Date().toISOString().slice(0, 10)) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}
