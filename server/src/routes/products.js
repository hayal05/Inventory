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
router.use(requireAuth);
const listQuery = z.object({
  q: z.string().trim().max(100, 'Too long (max 100)').optional(),
  lowStock: flag,
  page: z.coerce.number().int('Must be a whole number').min(1, 'Must be at least 1').default(1),
  limit: z.coerce.number().int('Must be a whole number').min(1, 'Must be at least 1').max(100, 'Max 100 per page').default(20),
});
const productColumns = {
  id: products.id, sku: products.sku, barcode: products.barcode, name: products.name,
  category: products.category, baseUnit: products.baseUnit,
  costPrice: products.costPrice, sellPrice: products.sellPrice, reorderLevel: products.reorderLevel,
  trackBatches: products.trackBatches, imageUrl: products.imageUrl,
  imagePublicId: products.imagePublicId, createdAt: products.createdAt, updatedAt: products.updatedAt,
};
const imageSent = (b) => b.imageUrl !== undefined || b.imagePublicId !== undefined;
const updateBody = createBody.partial().refine((b) => Object.keys(b).length > 0, {
  message: 'Send at least one field to update',
});
const idParam = z.string().uuid();
const isUniqueViolation = (err) => err?.code === '23505' || err?.cause?.code === '23505';

router.get('/', asyncHandler(async (req, res) => {
  const { q, lowStock, page, limit } = listQuery.parse(req.query);
  const conditions = [eq(products.orgId, req.user.orgId), eq(products.isActive, true)];
  if (q) {
    const pattern = containsPattern(q);
    conditions.push(or(ilike(products.name, pattern), ilike(products.sku, pattern), ilike(products.barcode, pattern)));
  }
  if (lowStock) conditions.push(lowStockCondition(req.user.orgId));
  const where = and(...conditions);
  const [items, [{ total }]] = await Promise.all([
    db.select({ ...productColumns, onHand: onHandExpr(req.user.orgId).as('on_hand') })
      .from(products).where(where).orderBy(asc(products.name), asc(products.id))
      .limit(limit).offset((page - 1) * limit),
    db.select({ total: count() }).from(products).where(where),
  ]);
  res.json({ items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
}));

router.post('/', requireRole('staff'), asyncHandler(async (req, res) => {
  const body = createBody.parse(req.body ?? {});
  if (imageSent(body)) assertOrgImage(req.user.orgId, body);
  let product;
  try {
    [product] = await db.insert(products).values({
      orgId: req.user.orgId, sku: body.sku, name: body.name,
      barcode: body.barcode ?? null, category: body.category ?? null, baseUnit: body.baseUnit,
      costPrice: body.costPrice ?? null, sellPrice: body.sellPrice ?? null,
      reorderLevel: body.reorderLevel, trackBatches: body.trackBatches,
      imageUrl: body.imageUrl ?? null, imagePublicId: body.imagePublicId ?? null,
    }).returning(productColumns);
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicateSku();
    throw err;
  }
  res.status(201).json(product);
}));

const MAX_IMPORT_ROWS = 1000;
const MAX_ERRORS_RETURNED = 200;
const PREVIEW_ROWS = 20;
router.post('/import', requireRole('staff'),
  express.text({ type: ['text/csv', 'text/plain'], limit: '1mb' }),
  asyncHandler(async (req, res) => {
    const commit = req.query.commit === 'true';
    if (typeof req.body !== 'string')
      throw new AppError(400, 'VALIDATION', 'Send the CSV as the request body with Content-Type: text/csv');
    let records;
    try { records = parseCsv(req.body); }
    catch (err) { throw new AppError(400, 'VALIDATION', `Could not read the CSV: ${err.message}`); }
    if (records.length === 0) throw new AppError(400, 'VALIDATION', 'The CSV is empty');
    const header = readHeader(records[0]);
    if (header.problems.length)
      throw new AppError(400, 'VALIDATION', header.problems.join('. '), { _header: header.problems.join('. ') });
    const dataRecords = records.slice(1);
    if (dataRecords.length === 0)
      throw new AppError(400, 'VALIDATION', 'The CSV has a header but no products');
    if (dataRecords.length > MAX_IMPORT_ROWS)
      throw new AppError(400, 'VALIDATION', `Too many rows (max ${MAX_IMPORT_ROWS} per import)`);

    const valid = [];
    const errors = [];
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

    const seen = new Map();
    let candidates = [];
    for (const item of valid) {
      const first = seen.get(item.data.sku);
      if (first !== undefined)
        errors.push({ row: item.row, sku: item.data.sku,
          errors: { sku: `Duplicate of row ${first} in this file` } });
      else {
        seen.set(item.data.sku, item.row);
        candidates.push(item);
      }
    }
    if (candidates.length) {
      const existing = await db.select({ sku: products.sku }).from(products)
        .where(and(eq(products.orgId, req.user.orgId), inArray(products.sku, candidates.map((c) => c.data.sku))));
      const taken = new Set(existing.map((e) => e.sku));
      candidates = candidates.filter((item) => {
        if (!taken.has(item.data.sku)) return true;
        errors.push({ row: item.row, sku: item.data.sku,
          errors: { sku: 'Already in use (it may belong to a deleted product)' } });
        return false;
      });
    }
    errors.sort((a, b) => a.row - b.row);
    const summary = {
      totalRows: dataRecords.length, validRows: candidates.length, invalidRows: errors.length,
      ignoredColumns: header.ignored, errors: errors.slice(0, MAX_ERRORS_RETURNED),
      errorsTruncated: errors.length > MAX_ERRORS_RETURNED,
    };
    if (!commit) return res.json({
      committed: false, ...summary,
      preview: candidates.slice(0, PREVIEW_ROWS).map((c) => ({ row: c.row, ...c.data })),
    });
    if (candidates.length === 0)
      throw new AppError(400, 'VALIDATION', 'No valid rows to import', { _rows: 'Fix the errors and try again' });

    const inserted = await db.insert(products)
      .values(candidates.map(({ data }) => ({
        orgId: req.user.orgId, sku: data.sku, name: data.name,
        barcode: data.barcode ?? null, category: data.category ?? null,
        baseUnit: data.baseUnit, costPrice: data.costPrice ?? null,
        sellPrice: data.sellPrice ?? null, reorderLevel: data.reorderLevel,
        trackBatches: data.trackBatches,
      })))
      .onConflictDoNothing({ target: [products.orgId, products.sku] })
      .returning({ sku: products.sku });
    const insertedSkus = new Set(inserted.map((r) => r.sku));
    for (const item of candidates)
      if (!insertedSkus.has(item.data.sku))
        errors.push({ row: item.row, sku: item.data.sku, errors: { sku: 'Already in use' } });
    errors.sort((a, b) => a.row - b.row);
    res.status(201).json({
      committed: true, ...summary, validRows: inserted.length,
      invalidRows: errors.length, errors: errors.slice(0, MAX_ERRORS_RETURNED),
      errorsTruncated: errors.length > MAX_ERRORS_RETURNED, imported: inserted.length,
    });
  })
);

const duplicateSku = () => new AppError(409, 'CONFLICT', 'A product with this SKU already exists', {
  sku: 'Already in use (it may belong to a deleted product)',
});
const productNotFound = () => new AppError(404, 'NOT_FOUND', 'Product not found');
function parseId(raw) {
  const r = idParam.safeParse(raw);
  if (!r.success) throw productNotFound();
  return r.data;
}
router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const { orgId } = req.user;
  const [product] = await db.select({ ...productColumns, onHand: onHandExpr(orgId).as('on_hand') })
    .from(products)
    .where(and(eq(products.id, id), eq(products.orgId, orgId), eq(products.isActive, true)));
  if (!product) throw productNotFound();
  res.json(product);
}));

router.get('/:id/movements', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const { type, locationId, page, limit } = movementsQuery.parse(req.query);
  const { orgId } = req.user;
  const [product] = await db.select({ id: products.id }).from(products)
    .where(and(eq(products.id, id), eq(products.orgId, orgId), eq(products.isActive, true)));
  if (!product) throw productNotFound();
  const conditions = [eq(stockMovements.orgId, orgId), eq(stockMovements.productId, id)];
  if (type) conditions.push(eq(stockMovements.type, type));
  if (locationId) conditions.push(eq(stockMovements.locationId, locationId));
  const where = and(...conditions);
  const [rows, [{ total }]] = await Promise.all([
    db.select({
      id: stockMovements.id, type: stockMovements.type, qtyDelta: stockMovements.qtyDelta,
      locationId: stockMovements.locationId, locationName: locations.name,
      batchId: stockMovements.batchId, batchNo: batches.batchNo,
      expiryDate: batches.expiryDate, unitCost: stockMovements.unitCost,
      reason: stockMovements.reason, refType: stockMovements.refType,
      refId: stockMovements.refId, note: stockMovements.note,
      userEmail: users.email, createdAt: stockMovements.createdAt,
    }).from(stockMovements)
      .innerJoin(locations, eq(locations.id, stockMovements.locationId))
      .innerJoin(users, eq(users.id, stockMovements.userId))
      .leftJoin(batches, eq(batches.id, stockMovements.batchId))
      .where(where).orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
      .limit(limit).offset((page - 1) * limit),
    db.select({ total: count() }).from(stockMovements).where(where),
  ]);
  const items = rows.map(({ batchId, batchNo, expiryDate, locationId: locId, locationName, userEmail, ...m }) => ({
    ...m, location: { id: locId, name: locationName },
    batch: batchId ? { id: batchId, batchNo, expiryDate } : null,
    user: userEmail,
  }));
  res.json({ items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
}));

router.put('/:id', requireRole('staff'), asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const body = updateBody.parse(req.body ?? {});
  if (imageSent(body)) assertOrgImage(req.user.orgId, body);
  const changes = { ...body, updatedAt: new Date() };
  let product;
  try {
    [product] = await db.update(products).set(changes)
      .where(and(eq(products.id, id), eq(products.orgId, req.user.orgId), eq(products.isActive, true)))
      .returning(productColumns);
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicateSku();
    throw err;
  }
  if (!product) throw productNotFound();
  res.json(product);
}));
router.delete('/:id', requireRole('staff'), asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const [deleted] = await db.update(products).set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(products.id, id), eq(products.orgId, req.user.orgId), eq(products.isActive, true)))
    .returning({ id: products.id });
  if (!deleted) throw productNotFound();
  res.status(204).end();
}));
export default router;
