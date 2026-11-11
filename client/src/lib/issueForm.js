// Form <-> API mapping for the Issue stock form. Kept free of React so it can be tested alone.
import { shortfallMessage } from './fefo.js';

export const EMPTY_ISSUE = { qty: '', note: '' };

// The quantity as a number when it is a valid whole number of at least 1, else null.
export function parseQty(text) {
  const t = text.trim();
  return /^\d+$/.test(t) && Number(t) >= 1 && Number(t) <= 2_000_000_000 ? Number(t) : null;
}

// `plan` is the FEFO preview for the typed quantity (or null when it cannot be computed yet).
// Returns { field: message }.
export function checkIssue(form, product, plan) {
  const errors = {};
  if (!product) errors.productId = 'Choose a product';
  const t = form.qty.trim();
  if (parseQty(form.qty) === null) errors.qty = !t || !/^\d+$/.test(t) || Number(t) < 1 ? 'Enter a whole number, 1 or more' : 'Too large';
  else if (plan && plan.shortfall > 0) errors.qty = shortfallMessage(plan);
  if (form.note.trim().length > 500) errors.note = 'Too long (max 500)';
  return errors;
}

// Body for POST /api/stock/issue. `locationId` is sent when known so the preview and the issue use the same place.
export function buildIssuePayload(form, product, locationId) {
  const payload = { productId: product.id, qty: parseQty(form.qty) };
  if (locationId) payload.locationId = locationId;
  if (form.note.trim()) payload.note = form.note.trim();
  return payload;
}

// Confirmation text from the 201 response `{ movements, picks }`.
export function describeIssue({ picks }, product) {
  const total = picks.reduce((sum, p) => sum + p.qty, 0);
  return `Issued ${new Intl.NumberFormat('en').format(total)} ${product.baseUnit} of ${product.name}.`;
}
