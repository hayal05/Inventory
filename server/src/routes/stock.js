import { Router } from 'express';
import { and, asc, count, eq, ilike, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { batches, locations, products, stockMovements } from '../db/schema.js';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { addMovement, resolveLocationId } from '../lib/ledger.js';
import { containsPattern } from '../lib/search.js';
import { adjustBody, issueBody, levelsQuery, receiveBody } from '../lib/stockSchema.js';
import { pickFefo } from '../lib/fefo.js';
import { shortfallMessage } from '../lib/fefoPlan.js';

const router = Router();
router.use(requireAuth);
const fieldError = (fields) => new AppError(400, 'VALIDATION', 'Invalid input', fields);

router.get('/', asyncHandler(async (req, res) => {
  const { q, productId, locationId, includeZero, includeBatches, page, limit } = levelsQuery.parse(req.query);
  const { orgId } = req.user;
  const conditions = [
    eq(stockMovements.orgId, orgId),
    eq(products.orgId, orgId), eq(products.isActive, true), eq(locations.orgId, orgId),
  ];
  if (productId) conditions.push(eq(stockMovements.productId, productId));
  if (locationId) conditions.push(eq(stockMovements.locationId, locationId));
  if (q) {
    const pattern = containsPattern(q);
    conditions.push(or(ilike(products.name, pattern), ilike(products.sku, pattern), ilike(products.barcode, pattern)));
  }
  const where = and(...conditions);
  const qty = sql`sum(${stockMovements.qtyDelta})`;
  const grouped = db.select({
    productId: sql`${products.id}`.as('product_id'),
    sku: products.sku, name: sql`${products.name}`.as('product_name'),
    baseUnit: products.baseUnit, reorderLevel: products.reorderLevel,
    trackBatches: products.trackBatches,
    locationId: sql`${locations.id}`.as('location_id'),
    locationName: sql`${locations.name}`.as('location_name'),
    qty: qty.mapWith(Number).as('qty'),
  }).from(stockMovements)
    .innerJoin(products, eq(products.id, stockMovements.productId))
    .innerJoin(locations, eq(locations.id, stockMovements.locationId))
    .where(where).groupBy(products.id, locations.id)
    .having(includeZero ? undefined : sql`${qty} <> 0`).as('levels');

  const [items, [{ total }]] = await Promise.all([
    db.select().from(grouped)
      .orderBy(asc(grouped.name), asc(grouped.productId), asc(grouped.locationName), asc(grouped.locationId))
      .limit(limit).offset((page - 1) * limit),
    db.select({ total: count() }).from(grouped),
  ]);
  if (includeBatches && items.length) {
    const batchRows = await db.select({
      productId: stockMovements.productId,
      locationId: stockMovements.locationId,
      batchId: batches.id, batchNo: batches.batchNo, expiryDate: batches.expiryDate,
      qty: sql`sum(${stockMovements.qtyDelta})`.mapWith(Number),
    }).from(stockMovements)
      .innerJoin(batches, eq(batches.id, stockMovements.batchId))
      .where(and(
        eq(stockMovements.orgId, orgId),
        eq(batches.orgId, orgId),
        isNotNull(stockMovements.batchId),
        inArray(stockMovements.productId, [...new Set(items.map((r) => r.productId))]),
        inArray(stockMovements.locationId, [...new Set(items.map((r) => r.locationId))])
      ))
      .groupBy(stockMovements.productId, stockMovements.locationId, batches.id)
      .having(includeZero ? undefined : sql`sum(${stockMovements.qtyDelta}) <> 0`);
    const byKey = new Map();
    for (const b of batchRows) {
      const key = `${b.productId}:${b.locationId}`;
      if (!byKey.has(key)) byKey.set(key, []);
      const { productId: _p, locationId: _l, ...rest } = b;
      byKey.get(key).push(rest);
    }
    const byExpiry = (a, b) =>
      (a.expiryDate ?? '9999-12-31').localeCompare(b.expiryDate ?? '9999-12-31') ||
      a.batchNo.localeCompare(b.batchNo);
    for (const row of items)
      row.batches = (byKey.get(`${row.productId}:${row.locationId}`) ?? []).sort(byExpiry);
  }
  res.json({ items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
}));

router.post('/receive', requireRole('staff'), asyncHandler(async (req, res) => {
  const body = receiveBody.parse(req.body ?? {});
  const { orgId, id: userId } = req.user;
  const result = await db.transaction(async (tx) => {
    const [product] = await tx.select({ id: products.id, trackBatches: products.trackBatches })
      .from(products)
      .where(and(eq(products.id, body.productId), eq(products.orgId, orgId), eq(products.isActive, true)))
      .for('update');
    if (!product) throw new AppError(404, 'NOT_FOUND', 'Product not found');
    const locationId = await resolveLocationId(tx, orgId, body.locationId);
    let batch = null;
    if (product.trackBatches) {
      const missing = {};
      if (!body.batchNo) missing.batchNo = 'Required for a product that tracks batches';
      if (!body.expiryDate) missing.expiryDate = 'Required for a product that tracks batches';
      if (Object.keys(missing).length) throw fieldError(missing);
      const [existing] = await tx.select().from(batches)
        .where(and(eq(batches.productId, product.id), eq(batches.orgId, orgId), eq(batches.batchNo, body.batchNo)));
      if (existing) {
        if (existing.expiryDate !== body.expiryDate)
          throw new AppError(409, 'CONFLICT', 'This batch number already exists with a different expiry date', {
            expiryDate: `Batch ${body.batchNo} expires ${existing.expiryDate}`,
          });
        batch = existing;
      } else {
        [batch] = await tx.insert(batches)
          .values({ orgId, productId: product.id, batchNo: body.batchNo, expiryDate: body.expiryDate }).returning();
      }
    } else if (body.batchNo || body.expiryDate) {
      throw fieldError({ [body.batchNo ? 'batchNo' : 'expiryDate']: 'This product does not track batches' });
    }
    const movement = await addMovement(tx, {
      orgId, userId, productId: product.id, locationId,
      batchId: batch?.id ?? null, type: 'receive', qtyDelta: body.qty,
      unitCost: body.unitCost ?? null, note: body.note ?? null,
    });
    return { movement, batch };
  });
  res.status(201).json(result);
}));

router.post('/issue', requireRole('staff'), asyncHandler(async (req, res) => {
  const body = issueBody.parse(req.body ?? {});
  const { orgId, id: userId } = req.user;
  const result = await db.transaction(async (tx) => {
    const locationId = await resolveLocationId(tx, orgId, body.locationId);
    const [location] = await tx.select({ id: locations.id }).from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.orgId, orgId)));
    if (!location) throw new AppError(404, 'NOT_FOUND', 'Location not found');
    const plan = await pickFefo(tx, { orgId, productId: body.productId, locationId, qty: body.qty });
    if (plan.shortfall > 0) {
      const message = shortfallMessage(plan);
      throw new AppError(409, 'INSUFFICIENT_STOCK', message, { qty: message });
    }
    const movements = [];
    for (const pick of plan.picks)
      movements.push(await addMovement(tx, {
        orgId, userId, productId: body.productId, locationId,
        batchId: pick.batchId, type: 'issue', qtyDelta: -pick.qty, note: body.note ?? null,
      }));
    return { movements, picks: plan.picks };
  });
  res.status(201).json(result);
}));

router.post('/adjust', requireRole('staff'), asyncHandler(async (req, res) => {
  const body = adjustBody.parse(req.body ?? {});
  const { orgId, id: userId } = req.user;
  const movement = await db.transaction(async (tx) => {
    const locationId = await resolveLocationId(tx, orgId, body.locationId);
    return addMovement(tx, {
      orgId, userId, productId: body.productId, locationId,
      batchId: body.batchId ?? null, type: 'adjust', qtyDelta: body.qtyDelta,
      reason: body.reason, note: body.note ?? null,
    });
  });
  res.status(201).json({ movement });
}));
export default router;
