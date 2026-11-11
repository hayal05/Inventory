// FEFO picker (task 29): which batches to draw from to issue `qty` of a product.
// Read-only: it writes nothing. Task 30 (POST /stock/issue) calls it, then calls
// addMovement() once per pick inside the same transaction.
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { batches, products, stockMovements } from '../db/schema.js';
import { AppError } from '../middleware/errors.js';
import { planFefo } from './fefoPlan.js';

// Today's date as YYYY-MM-DD in UTC. Callers may pass their own `today` (for example the
// business's local date) because "expired" flips at midnight.
export const utcToday = () => new Date().toISOString().slice(0, 10);

// `tx` MUST be a transaction. The product row is locked (FOR UPDATE) before stock is read, so
// a concurrent issue cannot pick the same units; the lock is held until the caller commits.
// input: { orgId, productId, locationId, qty, today? }
// Returns { picks, shortfall, available, expiredQty }:
//   picks      [{ batchId, batchNo, expiryDate, qty }], earliest expiry first; for a product
//              that does not track batches, one pick with batchId null
//   shortfall  units that could not be covered (0 = the request can be filled)
//   available  usable (not expired) units at that location
//   expiredQty units on hand that were skipped because their batch has expired
// The caller decides what to do with a shortfall (task 30 answers 409 INSUFFICIENT_STOCK).
export async function pickFefo(tx, { orgId, productId, locationId, qty, today = utcToday() }) {
  if (!Number.isInteger(qty) || qty < 1) {
    throw new AppError(400, 'VALIDATION', 'Invalid input', { qty: 'Must be a whole number of at least 1' });
  }

  const [product] = await tx
    .select({ id: products.id, trackBatches: products.trackBatches })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.orgId, orgId), eq(products.isActive, true)))
    .for('update');
  if (!product) throw new AppError(404, 'NOT_FOUND', 'Product not found');

  const base = and(
    eq(stockMovements.orgId, orgId),
    eq(stockMovements.productId, productId),
    eq(stockMovements.locationId, locationId)
  );
  const onHand = sql`coalesce(sum(${stockMovements.qtyDelta}), 0)`.mapWith(Number);

  if (!product.trackBatches) {
    const [row] = await tx.select({ onHand }).from(stockMovements).where(and(base, isNull(stockMovements.batchId)));
    return planFefo([{ batchId: null, batchNo: null, expiryDate: null, onHand: row.onHand }], qty, today);
  }

  const rows = await tx
    .select({
      batchId: batches.id,
      batchNo: batches.batchNo,
      expiryDate: batches.expiryDate,
      onHand: sql`sum(${stockMovements.qtyDelta})`.mapWith(Number),
    })
    .from(stockMovements)
    .innerJoin(batches, and(eq(batches.id, stockMovements.batchId), eq(batches.orgId, orgId)))
    .where(and(base, isNotNull(stockMovements.batchId)))
    .groupBy(batches.id);
  return planFefo(rows, qty, today);
}
