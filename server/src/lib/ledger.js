// The only place that writes to stock_movements (ledger rule 3).
// Rows are append-only: corrections are new reversing entries, never edits or deletes.
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { batches, locations, products, stockMovements } from '../db/schema.js';
import { AppError } from '../middleware/errors.js';

export const MOVEMENT_TYPES = ['receive', 'issue', 'adjust', 'return', 'expire'];
const POSITIVE_ONLY = new Set(['receive', 'return']); // stock comes in
const NEGATIVE_ONLY = new Set(['issue', 'expire']); // stock goes out; adjust may be either

const bad = (fields, message = 'Invalid stock movement') => new AppError(400, 'VALIDATION', message, fields);

// Pure checks that need no database. Returns the cleaned input; throws AppError(400).
export function validateMovement(input) {
  const { type, qtyDelta } = input;
  if (!MOVEMENT_TYPES.includes(type)) throw bad({ type: `Must be one of ${MOVEMENT_TYPES.join(', ')}` });
  if (!Number.isInteger(qtyDelta) || qtyDelta === 0 || Math.abs(qtyDelta) > 2_000_000_000) {
    throw bad({ qtyDelta: 'Must be a non-zero whole number' });
  }
  if (POSITIVE_ONLY.has(type) && qtyDelta < 0) throw bad({ qtyDelta: `A ${type} must add stock (positive)` });
  if (NEGATIVE_ONLY.has(type) && qtyDelta > 0) throw bad({ qtyDelta: `An ${type} must remove stock (negative)` });

  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (type === 'adjust' && !reason) throw bad({ reason: 'Required for an adjustment' });

  let unitCost = input.unitCost ?? null;
  if (typeof unitCost === 'number') unitCost = String(unitCost);
  if (unitCost !== null && !/^\d{1,10}(\.\d{1,2})?$/.test(unitCost)) {
    throw bad({ unitCost: 'Must be a non-negative amount with up to 2 decimals' });
  }
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim() : null;

  return { ...input, reason: reason || null, unitCost, note };
}

// Inserts one ledger row. `tx` MUST be a transaction (db.transaction(async (tx) => ...)),
// because the product row is locked until it commits (ledger rule 5). A caller that issues
// from several batches calls this once per batch inside the same transaction.
//
// input: { orgId, userId, productId, locationId, batchId?, type, qtyDelta, unitCost?,
//          reason?, refType?, refId?, note? }
// Rules enforced here: product and location belong to orgId; product is active; a
// track_batches product needs a batch of its own and others must not have one; stock
// never goes below zero for that product/location/batch.
export async function addMovement(tx, rawInput) {
  const input = validateMovement(rawInput);
  const { orgId, productId, locationId } = input;
  const batchId = input.batchId ?? null;

  // FOR UPDATE serialises concurrent writers on this product, so two cashiers cannot both
  // pass the stock check below against the same stock.
  const [product] = await tx
    .select({ id: products.id, trackBatches: products.trackBatches })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.orgId, orgId), eq(products.isActive, true)))
    .for('update');
  if (!product) throw new AppError(404, 'NOT_FOUND', 'Product not found');

  const [location] = await tx
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.orgId, orgId)));
  if (!location) throw new AppError(404, 'NOT_FOUND', 'Location not found');

  if (product.trackBatches && !batchId) throw bad({ batchId: 'This product tracks batches; a batch is required' });
  if (!product.trackBatches && batchId) throw bad({ batchId: 'This product does not track batches' });
  if (batchId) {
    const [batch] = await tx
      .select({ id: batches.id })
      .from(batches)
      .where(and(eq(batches.id, batchId), eq(batches.productId, productId), eq(batches.orgId, orgId)));
    if (!batch) throw new AppError(404, 'NOT_FOUND', 'Batch not found for this product');
  }

  if (input.qtyDelta < 0) {
    const [{ onHand }] = await tx
      .select({ onHand: sql`coalesce(sum(${stockMovements.qtyDelta}), 0)`.mapWith(Number) })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.orgId, orgId),
          eq(stockMovements.productId, productId),
          eq(stockMovements.locationId, locationId),
          batchId ? eq(stockMovements.batchId, batchId) : isNull(stockMovements.batchId)
        )
      );
    if (onHand + input.qtyDelta < 0) {
      throw new AppError(409, 'INSUFFICIENT_STOCK', `Only ${onHand} available`, {
        qtyDelta: `Only ${onHand} available`,
      });
    }
  }

  const [movement] = await tx
    .insert(stockMovements)
    .values({
      orgId,
      productId,
      batchId,
      locationId,
      qtyDelta: input.qtyDelta,
      type: input.type,
      unitCost: input.unitCost,
      reason: input.reason,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      note: input.note,
      userId: input.userId,
    })
    .returning();
  return movement;
}

// Uses the given location (checked later by addMovement), or the org's first one, which is
// the "Main store" created at registration.
export async function resolveLocationId(tx, orgId, locationId) {
  if (locationId) return locationId;
  const [first] = await tx
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.orgId, orgId))
    .orderBy(asc(locations.createdAt), asc(locations.id))
    .limit(1);
  if (!first) throw new AppError(404, 'NOT_FOUND', 'Location not found');
  return first.id;
}
