// Product routes. Mounted at /api/products. Every query filters on req.user.orgId.
import { Router } from 'express';
import { z } from 'zod';
import express from 'express';
import { and, asc, count, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { db } from '../db/client.js';
import { batches, locations, products, stockMovements, users } from '../db/schema.js';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { containsPattern } from '../lib/search.js';
import { assertOrgImage } from '../lib/cloudinary.js';
import { createBody } from '../lib/productSchema.js';
import { flag, movementsQuery } from '../lib/stockSchema.js';
import { lowStockCondition, onHandExpr } from '../lib/lowStock.js';
import { parseCsv, readHeader, recordToInput } from '../lib/csv.js';

const router = Router();
router.use(requireAuth); // reading is allowed for every role (viewer and up)

const listQuery = z.object({
  q: z.string().trim().max(100, 'Too long (max 100)').optional(),
  // lowStock=true: only products at or below their reorder level (same rule as the report)
  lowStock: flag,
  page: z.coerce.number().int('Must be a whole number').min(1, 'Must be at least 1').default(1),
  limit: z.coerce
    .number()
    .int('Must be a whole number')
    .min(1, 'Must be at least 1')
    .max(100, 'Max 100 per page')
    .default(20),
});

// Public shape of a product. org_id is deliberately not sent to the client.
// Prices are strings because Postgres numeric is exact; the UI should not do float math on them.
const productColumns = {
  id: products.id,
  sku: products.sku,
  barcode: products.barcode,
  name: products.name,
  category: products.category,
  baseUnit: products.baseUnit,
  costPrice: products.costPrice,
  sellPrice: products.sellPrice,
  reorderLevel: products.reorderLevel,
  trackBatches: products.trackBatches,
  imageUrl: products.imageUrl,
  imagePublicId: products.imagePublicId,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
};

const imageSent = (b) => b.imageUrl !== undefined || b.imagePublicId !== undefined;

// Partial update: send only the fields to change. Defaults must not apply here, or an
// update that omits baseUnit would silently reset it to 'pcs'. (.partial() skips defaults.)
const updateBody = createBody
  .partial()
  .refine((b) => Object.keys(b).length > 0, { message: 'Send at least one field to update' });

const idParam = z.string().uuid();

// Drizzle wraps driver errors, so the Postgres code may be on err.cause.
const isUniqueViolation = (err) => err?.code === '23505' || err?.cause?.code === '23505';

// GET /api/products?q=&lowStock=&page=&limit=
// Searches name, SKU, and barcode. Only active (not soft-deleted) products.
// lowStock=true keeps only products at or below their reorder level (total on hand, all locations).
// Each item also carries `onHand` (total on hand, all locations, from the ledger; 0 if never received).
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { q, lowStock, page, limit } = listQuery.parse(req.query);

    const conditions = [eq(products.orgId, req.user.orgId), eq(products.isActive, true)];
    if (q) {
      const pattern = containsPattern(q);
      conditions.push(
        or(ilike(products.name, pattern), ilike(products.sku, pattern), ilike(products.barcode, pattern))
      );
    }
    if (lowStock) conditions.push(lowStockCondition(req.user.orgId));
    const where = and(...conditions);

    const [items, [{ total }]] = await Promise.all([
      db
        .select({ ...productColumns, onHand: onHandExpr(req.user.orgId).as('on_hand') })
        .from(products)
        .where(where)
        // id as a tiebreaker keeps page boundaries stable when names repeat
        .orderBy(asc(products.name), asc(products.id))
        .limit(limit)
        .offset((page - 1) * limit),
      db.select({ total: count() }).from(products).where(where),
    ]);

    res.json({ items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
  })
);

// POST /api/products (staff and owner)
// org_id always comes from the logged-in user, never from the request body.
// Stock is only ever changed through the ledger, never on the product.
router.post(
  '/',
  requireRole('staff'),
  asyncHandler(async (req, res) => {
    const body = createBody.parse(req.body ?? {});
    if (imageSent(body)) assertOrgImage(req.user.orgId, body);

    let product;
    try {
      [product] = await db
        .insert(products)
        .values({
          orgId: req.user.orgId,
          sku: body.sku,
          name: body.name,
          barcode: body.barcode ?? null,
          category: body.category ?? null,
          baseUnit: body.baseUnit,
          costPrice: body.costPrice ?? null,
          sellPrice: body.sellPrice ?? null,
          reorderLevel: body.reorderLevel,
          trackBatches: body.trackBatches,
          imageUrl: body.imageUrl ?? null,
          imagePublicId: body.imagePublicId ?? null,
        })
        .returning(productColumns);
    } catch (err) {
      // The (org_id, sku) constraint also covers soft-deleted products.
      if (isUniqueViolation(err)) throw duplicateSku();
      throw err;
    }

    res.status(201).json(product);
  })
);

const MAX_IMPORT_ROWS = 1000;
const MAX_ERRORS_RETURNED = 200; // keeps the response small if a whole file is bad
const PREVIEW_ROWS = 20;

// POST /api/products/import (staff and owner)
// Body: the CSV text, sent as Content-Type: text/csv (max 1 MB, 1000 rows).
// Columns: sku, name, barcode, category, base_unit, cost_price, sell_price, reorder_level,
// track_batches. Only sku and name are required; header names are case-insensitive.
//
// Default is a preview: rows are validated and nothing is saved. Add ?commit=true to save
// the valid rows (rows with errors are skipped and reported). Row numbers match a
// spreadsheet: the header is row 1, the first product is row 2.
router.post(
  '/import',
  requireRole('staff'),
  express.text({ type: ['text/csv', 'text/plain'], limit: '1mb' }),
  asyncHandler(async (req, res) => {
    const commit = req.query.commit === 'true';
    if (typeof req.body !== 'string') {
      throw new AppError(400, 'VALIDATION', 'Send the CSV as the request body with Content-Type: text/csv');
    }

    let records;
    try {
      records = parseCsv(req.body);
    } catch (err) {
      throw new AppError(400, 'VALIDATION', `Could not read the CSV: ${err.message}`);
    }
    if (records.length === 0) throw new AppError(400, 'VALIDATION', 'The CSV is empty');

    const header = readHeader(records[0]);
    if (header.problems.length) {
      throw new AppError(400, 'VALIDATION', header.problems.join('. '), { _header: header.problems.join('. ') });
    }
    const dataRecords = records.slice(1);
    if (dataRecords.length === 0) throw new AppError(400, 'VALIDATION', 'The CSV has a header but no products');
    if (dataRecords.length > MAX_IMPORT_ROWS) {
      throw new AppError(400, 'VALIDATION', `Too many rows (max ${MAX_IMPORT_ROWS} per import)`);
    }

    // Validate each row with the same schema as POST /api/products.
    const valid = []; // { row, data }
    const errors = []; // { row, sku, errors: {field: message} }
    dataRecords.forEach((record, i) => {
      const row = i + 2;
      const input = recordToInput(record, header.index);
      const parsed = createBody.safeParse(input);
      if (parsed.success) valid.push({ row, data: parsed.data });
      else {
        const fieldErrors = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path.join('.') || '_';
          if (!fieldErrors[key]) fieldErrors[key] = issue.message;
        }
        errors.push({ row, sku: input.sku ?? null, errors: fieldErrors });
      }
    });

    // Duplicate SKUs: inside the file (later rows lose) and already in this org
    // (soft-deleted products still hold their SKU, so they count too).
    const seen = new Map(); // sku -> first row
    let candidates = [];
    for (const item of valid) {
      const first = seen.get(item.data.sku);
      if (first !== undefined) {
        errors.push({ row: item.row, sku: item.data.sku, errors: { sku: `Duplicate of row ${first} in this file` } });
      } else {
        seen.set(item.data.sku, item.row);
        candidates.push(item);
      }
    }
    if (candidates.length) {
      const existing = await db
        .select({ sku: products.sku })
        .from(products)
        .where(
          and(
            eq(products.orgId, req.user.orgId),
            inArray(products.sku, candidates.map((c) => c.data.sku))
          )
        );
      const taken = new Set(existing.map((e) => e.sku));
      candidates = candidates.filter((item) => {
        if (!taken.has(item.data.sku)) return true;
        errors.push({
          row: item.row,
          sku: item.data.sku,
          errors: { sku: 'Already in use (it may belong to a deleted product)' },
        });
        return false;
      });
    }
    errors.sort((a, b) => a.row - b.row);

    const summary = {
      totalRows: dataRecords.length,
      validRows: candidates.length,
      invalidRows: errors.length,
      ignoredColumns: header.ignored,
      errors: errors.slice(0, MAX_ERRORS_RETURNED),
      errorsTruncated: errors.length > MAX_ERRORS_RETURNED,
    };

    if (!commit) {
      return res.json({
        committed: false,
        ...summary,
        preview: candidates.slice(0, PREVIEW_ROWS).map((c) => ({ row: c.row, ...c.data })),
      });
    }

    if (candidates.length === 0) {
      throw new AppError(400, 'VALIDATION', 'No valid rows to import', { _rows: 'Fix the errors and try again' });
    }

    // org_id comes from the logged-in user. ON CONFLICT covers a SKU created by someone else
    // between the check above and this insert; those rows are reported as skipped.
    const inserted = await db
      .insert(products)
      .values(
        candidates.map(({ data }) => ({
          orgId: req.user.orgId,
          sku: data.sku,
          name: data.name,
          barcode: data.barcode ?? null,
          category: data.category ?? null,
          baseUnit: data.baseUnit,
          costPrice: data.costPrice ?? null,
          sellPrice: data.sellPrice ?? null,
          reorderLevel: data.reorderLevel,
          trackBatches: data.trackBatches,
        }))
      )
      .onConflictDoNothing({ target: [products.orgId, products.sku] })
      .returning({ sku: products.sku });

    const insertedSkus = new Set(inserted.map((r) => r.sku));
    for (const item of candidates) {
      if (!insertedSkus.has(item.data.sku)) {
        errors.push({ row: item.row, sku: item.data.sku, errors: { sku: 'Already in use' } });
      }
    }
    errors.sort((a, b) => a.row - b.row);

    res.status(201).json({
      committed: true,
      ...summary,
      validRows: inserted.length,
      invalidRows: errors.length,
      errors: errors.slice(0, MAX_ERRORS_RETURNED),
      errorsTruncated: errors.length > MAX_ERRORS_RETURNED,
      imported: inserted.length,
    });
  })
);

const duplicateSku = () =>
  new AppError(409, 'CONFLICT', 'A product with this SKU already exists', {
    sku: 'Already in use (it may belong to a deleted product)',
  });
const productNotFound = () => new AppError(404, 'NOT_FOUND', 'Product not found');

// A malformed id is just "not found", not a database error.
function parseId(raw) {
  const r = idParam.safeParse(raw);
  if (!r.success) throw productNotFound();
  return r.data;
}

// GET /api/products/:id (all roles)
// One active product in the caller's org, with `onHand` (total across locations, from the ledger).
// 404 for unknown, other-org, malformed-id, or soft-deleted products, like the other :id routes.
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { orgId } = req.user;
    const [product] = await db
      .select({ ...productColumns, onHand: onHandExpr(orgId).as('on_hand') })
      .from(products)
      .where(and(eq(products.id, id), eq(products.orgId, orgId), eq(products.isActive, true)));
    if (!product) throw productNotFound();
    res.json(product);
  })
);

// GET /api/products/:id/movements?type=&locationId=&page=&limit=
// Ledger history of one active product, newest first (all roles). Read-only: the ledger is
// append-only and only changes through addMovement(). 404 for unknown, other-org, malformed-id,
// or soft-deleted products, like the other :id routes.
// Each row: id, type, qtyDelta, location, batch (null if none), unitCost, reason, refType,
// refId, note, user (email of who made it), createdAt. Returns { items, page, limit, total, totalPages }.
router.get(
  '/:id/movements',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { type, locationId, page, limit } = movementsQuery.parse(req.query);
    const { orgId } = req.user;

    const [product] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, id), eq(products.orgId, orgId), eq(products.isActive, true)));
    if (!product) throw productNotFound();

    const conditions = [eq(stockMovements.orgId, orgId), eq(stockMovements.productId, id)];
    if (type) conditions.push(eq(stockMovements.type, type));
    if (locationId) conditions.push(eq(stockMovements.locationId, locationId));
    const where = and(...conditions);

    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: stockMovements.id,
          type: stockMovements.type,
          qtyDelta: stockMovements.qtyDelta,
          locationId: stockMovements.locationId,
          locationName: locations.name,
          batchId: stockMovements.batchId,
          batchNo: batches.batchNo,
          expiryDate: batches.expiryDate,
          unitCost: stockMovements.unitCost,
          reason: stockMovements.reason,
          refType: stockMovements.refType,
          refId: stockMovements.refId,
          note: stockMovements.note,
          userEmail: users.email,
          createdAt: stockMovements.createdAt,
        })
        .from(stockMovements)
        .innerJoin(locations, eq(locations.id, stockMovements.locationId))
        .innerJoin(users, eq(users.id, stockMovements.userId))
        .leftJoin(batches, eq(batches.id, stockMovements.batchId))
        .where(where)
        // id as a tiebreaker keeps page boundaries stable for rows created in the same instant
        .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
        .limit(limit)
        .offset((page - 1) * limit),
      db.select({ total: count() }).from(stockMovements).where(where),
    ]);

    const items = rows.map(({ batchId, batchNo, expiryDate, locationId: locId, locationName, userEmail, ...m }) => ({
      ...m,
      location: { id: locId, name: locationName },
      batch: batchId ? { id: batchId, batchNo, expiryDate } : null,
      user: userEmail,
    }));

    res.json({ items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
  })
);

// PUT /api/products/:id (staff and owner)
// Partial update of an active product in the caller's org. Deleted products cannot be edited.
router.put(
  '/:id',
  requireRole('staff'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const body = updateBody.parse(req.body ?? {});
    if (imageSent(body)) assertOrgImage(req.user.orgId, body);

    // Undefined values are skipped by Drizzle; null clears barcode, category, and prices.
    const changes = { ...body, updatedAt: new Date() };

    let product;
    try {
      [product] = await db
        .update(products)
        .set(changes)
        .where(and(eq(products.id, id), eq(products.orgId, req.user.orgId), eq(products.isActive, true)))
        .returning(productColumns);
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateSku();
      throw err;
    }
    if (!product) throw productNotFound();

    res.json(product);
  })
);

// DELETE /api/products/:id (staff and owner)
// Soft delete: sets is_active=false. The row, its SKU, and any future ledger history stay,
// so stock history is never orphaned.
router.delete(
  '/:id',
  requireRole('staff'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);

    const [deleted] = await db
      .update(products)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(products.id, id), eq(products.orgId, req.user.orgId), eq(products.isActive, true)))
      .returning({ id: products.id });
    if (!deleted) throw productNotFound();

    res.status(204).end();
  })
);

export default router;
