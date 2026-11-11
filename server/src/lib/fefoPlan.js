// Pure FEFO (first expired, first out) allocation. No database, so it can be tested alone.
// rows: [{ batchId, batchNo, expiryDate: 'YYYY-MM-DD' | null, onHand }]
// today: 'YYYY-MM-DD'. A batch is usable through its expiry date; from the next day it is
// expired and is never drawn from. A batch with no expiry date is used last.
export function planFefo(rows, qty, today) {
  if (!Number.isInteger(qty) || qty < 1) throw new RangeError('qty must be a whole number >= 1');

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
  return (
    ax.localeCompare(bx) ||
    String(a.batchNo ?? '').localeCompare(String(b.batchNo ?? '')) ||
    String(a.batchId ?? '').localeCompare(String(b.batchId ?? ''))
  );
}

// Text for the 409 when a plan cannot cover the request.
export function shortfallMessage({ available, expiredQty }) {
  const base = `Only ${available} available`;
  return expiredQty > 0 ? `${base} (${expiredQty} more on hand ${expiredQty === 1 ? 'is' : 'are'} expired)` : base;
}
