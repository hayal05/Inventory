// Form <-> API mapping for the Adjust stock dialog. Kept free of React so it can be tested alone.
// The person picks a direction (add or remove) and types a positive amount; the API wants one signed number.

export const EMPTY_ADJUST = { direction: 'remove', qty: '', reason: '', note: '', batchId: '' };

// Suggestions for the reason box (free text is allowed; the server only requires something).
export const REASONS = ['Stock count correction', 'Damaged', 'Expired, disposed', 'Lost or stolen', 'Found in a count', 'Opening balance'];

// `ctx` = { trackBatches, onHand }, where onHand is the quantity at the chosen place: the selected batch
// for a batch-tracked product, otherwise the product's stock at the location. Returns { field: message }.
export function checkAdjust(form, ctx) {
  const errors = {};
  if (ctx.trackBatches && !form.batchId) errors.batchId = 'Choose the batch to correct';

  const qty = form.qty.trim();
  if (!/^\d+$/.test(qty) || Number(qty) < 1) errors.qty = 'Enter a whole number, 1 or more';
  else if (Number(qty) > 2_000_000_000) errors.qty = 'Too large';
  else if (form.direction === 'remove' && Number(qty) > ctx.onHand) {
    errors.qty = ctx.onHand > 0 ? `Only ${ctx.onHand} on hand` : 'Nothing on hand to remove';
  }

  const reason = form.reason.trim();
  if (!reason) errors.reason = 'Required';
  else if (reason.length > 200) errors.reason = 'Too long (max 200)';
  if (form.note.trim().length > 500) errors.note = 'Too long (max 500)';
  return errors;
}

// Body for POST /api/stock/adjust. `locationId` is sent when known so batch and location always match.
export function buildAdjustPayload(form, { productId, trackBatches, locationId }) {
  const qty = Number(form.qty.trim());
  const payload = { productId, qtyDelta: form.direction === 'remove' ? -qty : qty, reason: form.reason.trim() };
  if (locationId) payload.locationId = locationId;
  if (trackBatches) payload.batchId = form.batchId;
  if (form.note.trim()) payload.note = form.note.trim();
  return payload;
}

// Confirmation text from the 201 response `{ movement }`.
export function describeAdjust({ movement }, product) {
  const n = movement.qtyDelta;
  const amount = new Intl.NumberFormat('en').format(Math.abs(n));
  return `${n < 0 ? 'Removed' : 'Added'} ${amount} ${product.baseUnit} ${n < 0 ? 'from' : 'to'} ${product.name}.`;
}
