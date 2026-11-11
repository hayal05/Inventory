// Preview of the server's FEFO pick (first expired, first out). The server decides for real when the
// issue is saved (server/src/lib/fefoPlan.js); keep this in step with it. No React, so it can be tested alone.
// rows: [{ batchId, batchNo, expiryDate: 'YYYY-MM-DD' | null, onHand }]. today: 'YYYY-MM-DD'.
// A batch is usable through its expiry date; from the next day it is expired and never drawn from.
export function planFefo(rows, qty, today) {
  const stocked = rows.filter((r) => r.onHand > 0);
  const expired = (r) => r.expiryDate != null && r.expiryDate < today;
  const usable = stocked.filter((r) => !expired(r)).sort(byExpiry);
  const expiredQty = stocked.filter(expired).reduce((sum, r) => sum + r.onHand, 0);

  const picks = [];
  let left = qty;
  for (const r of usable) {
    if (left === 0) break;
    const take = Math.min(left, r.onHand);
    picks.push({ batchId: r.batchId, batchNo: r.batchNo, expiryDate: r.expiryDate, qty: take });
    left -= take;
  }
  const available = usable.reduce((sum, r) => sum + r.onHand, 0);
  return { picks, shortfall: left, available, expiredQty };
}

function byExpiry(a, b) {
  const ax = a.expiryDate ?? '9999-12-31';
  const bx = b.expiryDate ?? '9999-12-31';
  return ax.localeCompare(bx) || String(a.batchNo ?? '').localeCompare(String(b.batchNo ?? '')) || String(a.batchId ?? '').localeCompare(String(b.batchId ?? ''));
}

// Same wording as the server's 409 message.
export function shortfallMessage({ available, expiredQty }) {
  const base = `Only ${available} available`;
  return expiredQty > 0 ? `${base} (${expiredQty} more on hand ${expiredQty === 1 ? 'is' : 'are'} expired)` : base;
}

// Plan for a product from its row in GET /api/stock?includeBatches=true (or null/{} when it has no stock yet).
// A product without batch tracking has one pool of unbatched stock and a single pick with batchId null.
export function planForProduct(product, stockRow, qty, today) {
  if (product.trackBatches) {
    const rows = (stockRow?.batches ?? []).map((b) => ({ batchId: b.batchId, batchNo: b.batchNo, expiryDate: b.expiryDate, onHand: b.qty }));
    return planFefo(rows, qty, today);
  }
  const available = Math.max(0, stockRow?.qty ?? 0);
  const take = Math.min(qty, available);
  return { picks: take > 0 ? [{ batchId: null, batchNo: null, expiryDate: null, qty: take }] : [], shortfall: qty - take, available, expiredQty: 0 };
}
