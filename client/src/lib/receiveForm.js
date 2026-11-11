// Form <-> API mapping for the Receive stock form. Kept free of React so it can be tested alone.
// Form values are all strings, as typed in the inputs.

export const EMPTY_RECEIVE = { qty: '', unitCost: '', batchNo: '', expiryDate: '', note: '' };

// Today as YYYY-MM-DD in UTC (the server judges expiry by the UTC date, like FEFO).
export const todayUtc = () => new Date().toISOString().slice(0, 10);

// Real calendar date as YYYY-MM-DD (rejects 2026-02-30). Same rule as the server.
export function isRealDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Quick checks before calling the server. The server validates again; this only saves a round trip
// for the obvious mistakes. `product` is the chosen product (or null). Returns { field: message }.
export function checkReceive(form, product) {
  const errors = {};
  if (!product) errors.productId = 'Choose a product';

  const qty = form.qty.trim();
  if (!/^\d+$/.test(qty) || Number(qty) < 1) errors.qty = 'Enter a whole number, 1 or more';
  else if (Number(qty) > 2_000_000_000) errors.qty = 'Too large';

  const cost = form.unitCost.trim();
  if (cost !== '' && !/^\d{1,10}(\.\d{1,2})?$/.test(cost)) errors.unitCost = 'Use an amount like 12.50';

  // Batch and expiry are required, and only sent, for products that track batches (ledger rule 7).
  if (product?.trackBatches) {
    const batchNo = form.batchNo.trim();
    if (!batchNo) errors.batchNo = 'Required for this product';
    else if (batchNo.length > 64) errors.batchNo = 'Too long (max 64)';
    const expiry = form.expiryDate.trim();
    if (!expiry) errors.expiryDate = 'Required for this product';
    else if (!isRealDate(expiry)) errors.expiryDate = 'Not a real date';
  }

  if (form.note.trim().length > 500) errors.note = 'Too long (max 500)';
  return errors;
}

// Body for POST /api/stock/receive. Blank optional fields are left out.
export function buildReceivePayload(form, product) {
  const payload = { productId: product.id, qty: Number(form.qty.trim()) };
  if (form.unitCost.trim()) payload.unitCost = form.unitCost.trim();
  if (product.trackBatches) {
    payload.batchNo = form.batchNo.trim();
    payload.expiryDate = form.expiryDate.trim();
  }
  if (form.note.trim()) payload.note = form.note.trim();
  return payload;
}

// One-line confirmation after a successful receipt, from the 201 response `{ movement, batch }`.
export function describeReceipt({ movement, batch }, product) {
  const qty = new Intl.NumberFormat('en').format(movement.qtyDelta);
  const base = `Received ${qty} ${product.baseUnit} of ${product.name}`;
  return batch ? `${base} (batch ${batch.batchNo}, expires ${batch.expiryDate}).` : `${base}.`;
}
