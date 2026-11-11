import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { batches, products, stockMovements } from '../db/schema.js';
import { AppError } from '../middleware/errors.js';
import { planFefo } from './fefoPlan.js';

export const utcToday = () => new Date().toISOString().slice(0, 10);

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
