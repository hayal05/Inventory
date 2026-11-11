// Report routes. Mounted at /api/reports. Read-only, all roles. Every query filters on org_id.
import { Router } from 'express';
import { and, asc, count, eq, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { batches, locations, products, stockMovements } from '../db/schema.js';
import { asyncHandler } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { expiringQuery, lowStockQuery, valuationQuery } from '../lib/stockSchema.js';
import { addDays, daysLeft } from '../lib/expiry.js';
import { utcToday } from '../lib/fefo.js';
import { lowStockCondition, onHandExpr } from '../lib/lowStock.js';

const router = Router();
router.use(requireAuth);

// GET /api/reports/low-stock?page=&limit=
// Active products whose total on hand (all locations) is at or below their reorder level.
// Products with reorder level 0 (not set) are left out. Most short first (biggest shortfall),
// then by name. Returns { items, page, limit, total, totalPages }; each item has
// productId, sku, name, category, baseUnit, reorderLevel, onHand, shortfall.
router.get(
  '/low-stock',
  asyncHandler(async (req, res) => {
    const { page, limit } = lowStockQuery.parse(req.query);
    const { orgId } = req.user;

    const where = and(eq(products.orgId, orgId), eq(products.isActive, true), lowStockCondition(orgId));
    const onHand = onHandExpr(orgId);

    const [items, [{ total }]] = await Promise.all([
      db
        .select({
          productId: products.id,
          sku: products.sku,
          name: products.name,
          category: products.category,
          baseUnit: products.baseUnit,
          reorderLevel: products.reorderLevel,
          onHand: onHand.mapWith(Number),
          shortfall: sql`${products.reorderLevel} - ${onHand}`.mapWith(Number),
        })
        .from(products)
        .where(where)
        // id as a tiebreaker keeps page boundaries stable
        .orderBy(sql`${products.reorderLevel} - ${onHand} desc`, asc(products.name), asc(products.id))
        .limit(limit)
        .offset((page - 1) * limit),
      db.select({ total: count() }).from(products).where(where),
    ]);

    res.json({ items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
  })
);

// GET /api/reports/expiring?days=90&page=&limit=
// Batches that still have stock and expire within `days` days (default 90, max 365), plus any
// batch that is already expired but still on hand. One row per batch and location, soonest
// expiry first. Batches with no expiry date are not listed. Only products with batch tracking
// have batches. "Today" is the UTC date, as in FEFO: a batch is usable through its expiry date.
// Each item: productId, sku, name, baseUnit, batchId, batchNo, expiryDate, locationId,
// locationName, qty, daysLeft (0 = today, negative = already expired), expired.
// Returns { asOf, days, items, page, limit, total, totalPages }.
router.get(
  '/expiring',
  asyncHandler(async (req, res) => {
    const { days, page, limit } = expiringQuery.parse(req.query);
    const { orgId } = req.user;
    const today = utcToday();
    const cutoff = addDays(today, days);

    const qty = sql`sum(${stockMovements.qtyDelta})`;
    // This select becomes a subquery, and the outer select repeats the bare column names,
    // so the columns that share a name across tables (id, name) need explicit aliases.
    const grouped = db
      .select({
        productId: sql`${products.id}`.as('product_id'),
        sku: products.sku,
        name: sql`${products.name}`.as('product_name'),
        baseUnit: products.baseUnit,
        batchId: sql`${batches.id}`.as('batch_id'),
        batchNo: batches.batchNo,
        expiryDate: batches.expiryDate,
        locationId: sql`${locations.id}`.as('location_id'),
        locationName: sql`${locations.name}`.as('location_name'),
        qty: qty.mapWith(Number).as('qty'),
      })
      .from(stockMovements)
      .innerJoin(batches, eq(batches.id, stockMovements.batchId))
      .innerJoin(products, eq(products.id, stockMovements.productId))
      .innerJoin(locations, eq(locations.id, stockMovements.locationId))
      .where(
        and(
          eq(stockMovements.orgId, orgId),
          eq(batches.orgId, orgId),
          eq(products.orgId, orgId),
          eq(locations.orgId, orgId),
          eq(products.isActive, true),
          lte(batches.expiryDate, cutoff) // also excludes null expiry
        )
      )
      .groupBy(products.id, batches.id, locations.id)
      .having(sql`${qty} > 0`)
      .as('expiring');

    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(grouped)
        // ids as tiebreakers keep page boundaries stable
        .orderBy(asc(grouped.expiryDate), asc(grouped.name), asc(grouped.batchNo), asc(grouped.batchId), asc(grouped.locationId))
        .limit(limit)
        .offset((page - 1) * limit),
      db.select({ total: count() }).from(grouped),
    ]);

    const items = rows.map((r) => {
      const left = daysLeft(today, r.expiryDate);
      return { ...r, daysLeft: left, expired: left < 0 };
    });

    res.json({ asOf: today, days, items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
  })
);

// GET /api/reports/valuation?page=&limit=
// Stock value = total on hand (all locations) x the product's cost_price. Active products with
// stock on hand only. Biggest value first. A product with no cost price has value null and is
// counted in totals.productsMissingCost; it adds nothing to totalValue, so a non-zero
// productsMissingCost means totalValue is understated. Money is returned as exact strings
// with 2 decimals (do not do float math on them in the UI).
// Returns { totals: { totalValue, totalUnits, productsWithStock, productsMissingCost },
//           items, page, limit, total, totalPages }; each item: productId, sku, name, category,
//           baseUnit, costPrice, onHand, value.
router.get(
  '/valuation',
  asyncHandler(async (req, res) => {
    const { page, limit } = valuationQuery.parse(req.query);
    const { orgId } = req.user;

    const qty = sql`sum(${stockMovements.qtyDelta})`;
    const grouped = db
      .select({
        productId: products.id,
        sku: products.sku,
        name: products.name,
        category: products.category,
        baseUnit: products.baseUnit,
        costPrice: products.costPrice,
        onHand: qty.mapWith(Number).as('on_hand'),
        value: sql`(${qty} * ${products.costPrice})::numeric(18,2)`.as('value'),
      })
      .from(stockMovements)
      .innerJoin(products, eq(products.id, stockMovements.productId))
      .where(and(eq(stockMovements.orgId, orgId), eq(products.orgId, orgId), eq(products.isActive, true)))
      .groupBy(products.id)
      .having(sql`${qty} > 0`)
      .as('valuation');

    const [items, [totals]] = await Promise.all([
      db
        .select()
        .from(grouped)
        // nulls last: products without a cost price go to the end; ids keep pages stable
        .orderBy(sql`${grouped.value} desc nulls last`, asc(grouped.name), asc(grouped.productId))
        .limit(limit)
        .offset((page - 1) * limit),
      db
        .select({
          totalValue: sql`coalesce(sum(${grouped.value}), 0)::numeric(18,2)`,
          totalUnits: sql`coalesce(sum(${grouped.onHand}), 0)`.mapWith(Number),
          productsWithStock: count(),
          productsMissingCost: sql`count(*) filter (where ${grouped.costPrice} is null)`.mapWith(Number),
        })
        .from(grouped),
    ]);

    const total = totals.productsWithStock;
    res.json({
      totals: { ...totals, totalValue: String(totals.totalValue) },
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  })
);

export default router;
