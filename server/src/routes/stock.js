// Stock routes. Mounted at /api/stock. Every query filters on req.user.orgId.
// Stock only changes through addMovement() (lib/ledger.js).
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

// GET /api/stock?q=&productId=&locationId=&includeZero=&includeBatches=&page=&limit=
// Current stock per product and location: SUM(qty_delta) over the ledger (never a stored
// quantity). All roles. Active products only. Rows at exactly 0 are hidden unless
// includeZero=true; a product never received has no ledger rows, so it has no row here.
// includeBatches=true adds `batches` to each row (batch-tracked products only).
// Returns { items, page, limit, total, totalPages }; `qty` is a number.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { q, productId, locationId, includeZero, includeBatches, page, limit } = levelsQuery.parse(req.query);
    const { orgId } = req.user;

    const conditions = [
      eq(stockMovements.orgId, orgId),
      eq(products.orgId, orgId),
      eq(products.isActive, true),
      eq(locations.orgId, orgId),
    ];
    if (productId) conditions.push(eq(stockMovements.productId, productId));
    if (locationId) conditions.push(eq(stockMovements.locationId, locationId));
    if (q) {
      const pattern = containsPattern(q);
      conditions.push(
        or(ilike(products.name, pattern), ilike(products.sku, pattern), ilike(products.barcode, pattern))
      );
    }
    const where = and(...conditions);
    const qty = sql`sum(${stockMovements.qtyDelta})`;

    const grouped = db
      .select({
        // Aliased because this select becomes a subquery and products and locations
        // both have `id` and `name` columns (the outer select would find them ambiguous).
        productId: sql`${products.id}`.as('product_id'),
        sku: products.sku,
        name: sql`${products.name}`.as('product_name'),
        baseUnit: products.baseUnit,
        reorderLevel: products.reorderLevel,
        trackBatches: products.trackBatches,
        locationId: sql`${locations.id}`.as('location_id'),
        locationName: sql`${locations.name}`.as('location_name'),
        qty: qty.mapWith(Number).as('qty'),
      })
      .from(stockMovements)
      .innerJoin(products, eq(products.id, stockMovements.productId))
      .innerJoin(locations, eq(locations.id, stockMovements.locationId))
      .where(where)
      .groupBy(products.id, locations.id)
      .having(includeZero ? undefined : sql`${qty} <> 0`)
      .as('levels');

    const [items, [{ total }]] = await Promise.all([
      db
        .select()
        .from(grouped)
        // ids as tiebreakers keep page boundaries stable when names repeat
        .orderBy(asc(grouped.name), asc(grouped.productId), asc(grouped.locationName), asc(grouped.locationId))
        .limit(limit)
        .offset((page - 1) * limit),
      db.select({ total: count() }).from(grouped),
    ]);

    if (includeBatches && items.length) {
      const batchRows = await db
        .select({
          productId: stockMovements.productId,
          locationId: stockMovements.locationId,
          batchId: batches.id,
          batchNo: batches.batchNo,
          expiryDate: batches.expiryDate,
          qty: sql`sum(${stockMovements.qtyDelta})`.mapWith(Number),
        })
        .from(stockMovements)
        .innerJoin(batches, eq(batches.id, stockMovements.batchId))
        .where(
          and(
            eq(stockMovements.orgId, orgId),
            eq(batches.orgId, orgId),
            isNotNull(stockMovements.batchId),
            inArray(stockMovements.productId, [...new Set(items.map((r) => r.productId))]),
            inArray(stockMovements.locationId, [...new Set(items.map((r) => r.locationId))])
          )
        )
        .groupBy(stockMovements.productId, stockMovements.locationId, batches.id)
        .having(includeZero ? undefined : sql`sum(${stockMovements.qtyDelta}) <> 0`);

      const byKey = new Map();
      for (const b of batchRows) {
        const key = `${b.productId}:${b.locationId}`;
        if (!byKey.has(key)) byKey.set(key, []);
        const { productId: _p, locationId: _l, ...rest } = b;
        byKey.get(key).push(rest);
      }
      // FEFO order: earliest expiry first, no expiry last.
      const byExpiry = (a, b) =>
        (a.expiryDate ?? '9999-12-31').localeCompare(b.expiryDate ?? '9999-12-31') ||
        a.batchNo.localeCompare(b.batchNo);
      for (const row of items) {
        row.batches = (byKey.get(`${row.productId}:${row.locationId}`) ?? []).sort(byExpiry);
      }
    }

    res.json({ items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
  })
);

// POST /api/stock/receive (staff and owner)
// Body: { productId, qty, locationId?, unitCost?, batchNo?, expiryDate?, note? }
// A product with track_batches needs batchNo and expiryDate (ledger rule 7); the batch is
// created on first receipt and reused after. Other products must not send them.
// Returns 201 with the ledger row (and the batch, if any).
router.post(
  '/receive',
  requireRole('staff'),
  asyncHandler(async (req, res) => {
    const body = receiveBody.parse(req.body ?? {});
    const { orgId, id: userId } = req.user;

    const result = await db.transaction(async (tx) => {
      // Lock the product first so two receipts of the same new batch cannot both create it.
      const [product] = await tx
        .select({ id: products.id, trackBatches: products.trackBatches })
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

        const [existing] = await tx
          .select()
          .from(batches)
          .where(and(eq(batches.productId, product.id), eq(batches.orgId, orgId), eq(batches.batchNo, body.batchNo)));
        if (existing) {
          if (existing.expiryDate !== body.expiryDate) {
            throw new AppError(409, 'CONFLICT', 'This batch number already exists with a different expiry date', {
              expiryDate: `Batch ${body.batchNo} expires ${existing.expiryDate}`,
            });
          }
          batch = existing;
        } else {
          [batch] = await tx
            .insert(batches)
            .values({ orgId, productId: product.id, batchNo: body.batchNo, expiryDate: body.expiryDate })
            .returning();
        }
      } else if (body.batchNo || body.expiryDate) {
        throw fieldError({
          [body.batchNo ? 'batchNo' : 'expiryDate']: 'This product does not track batches',
        });
      }

      const movement = await addMovement(tx, {
        orgId,
        userId,
        productId: product.id,
        locationId,
        batchId: batch?.id ?? null,
        type: 'receive',
        qtyDelta: body.qty,
        unitCost: body.unitCost ?? null,
        note: body.note ?? null,
      });
      return { movement, batch };
    });

    res.status(201).json(result);
  })
);

// POST /api/stock/issue (staff and owner)
// Body: { productId, qty, locationId?, note? }. qty is positive; ledger rows are negative.
// Batch-tracked products are drawn FEFO (earliest expiry first, expired batches skipped),
// one ledger row per batch, all in one transaction: either every row is written or none.
// A product without batch tracking issues from its unbatched stock in one row.
// Returns 201 { movements, picks }; 409 INSUFFICIENT_STOCK if the usable stock cannot cover qty.
router.post(
  '/issue',
  requireRole('staff'),
  asyncHandler(async (req, res) => {
    const body = issueBody.parse(req.body ?? {});
    const { orgId, id: userId } = req.user;

    const result = await db.transaction(async (tx) => {
      const locationId = await resolveLocationId(tx, orgId, body.locationId);
      // Check the location first, so another org's location id is a 404, not "no stock".
      const [location] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(and(eq(locations.id, locationId), eq(locations.orgId, orgId)));
      if (!location) throw new AppError(404, 'NOT_FOUND', 'Location not found');

      // pickFefo locks the product row until this transaction ends, so two issues of the
      // same product run one after the other and cannot pick the same units.
      const plan = await pickFefo(tx, { orgId, productId: body.productId, locationId, qty: body.qty });
      if (plan.shortfall > 0) {
        const message = shortfallMessage(plan);
        throw new AppError(409, 'INSUFFICIENT_STOCK', message, { qty: message });
      }

      const movements = [];
      for (const pick of plan.picks) {
        movements.push(
          await addMovement(tx, {
            orgId,
            userId,
            productId: body.productId,
            locationId,
            batchId: pick.batchId,
            type: 'issue',
            qtyDelta: -pick.qty,
            note: body.note ?? null,
          })
        );
      }
      return { movements, picks: plan.picks };
    });

    res.status(201).json(result);
  })
);

// POST /api/stock/adjust (staff and owner)
// Body: { productId, qtyDelta, reason, locationId?, batchId?, note? }
// qtyDelta is signed: +3 adds stock found in a count, -2 removes damaged or lost stock.
// The reason is required. A product with track_batches needs the batchId being corrected.
// Mistakes are fixed by another adjustment, never by editing or deleting a ledger row.
// Returns 201 with the ledger row; 409 INSUFFICIENT_STOCK if it would go below zero.
router.post(
  '/adjust',
  requireRole('staff'),
  asyncHandler(async (req, res) => {
    const body = adjustBody.parse(req.body ?? {});
    const { orgId, id: userId } = req.user;

    const movement = await db.transaction(async (tx) => {
      const locationId = await resolveLocationId(tx, orgId, body.locationId);
      return addMovement(tx, {
        orgId,
        userId,
        productId: body.productId,
        locationId,
        batchId: body.batchId ?? null,
        type: 'adjust',
        qtyDelta: body.qtyDelta,
        reason: body.reason,
        note: body.note ?? null,
      });
    });

    res.status(201).json({ movement });
  })
);

export default router;
