import { Router } from 'express';
import { and, count, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { batches, products, stockMovements } from '../db/schema.js';
import { asyncHandler } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { dailyQuery, monthlyQuery, summaryQuery } from '../lib/stockSchema.js';
import { lowStockCondition } from '../lib/lowStock.js';
import { addDays } from '../lib/expiry.js';
import { utcToday } from '../lib/fefo.js';
import { pctChange } from '../lib/pct.js';
import { fillMonths, lastMonths, monthStart } from '../lib/months.js';
import { fillDays, lastDays } from '../lib/days.js';

const router = Router();
router.use(requireAuth);
async function kpisAt(orgId, at, refDate, expiringDays) {
  const movedBy = at ? lte(stockMovements.createdAt, at) : undefined;
  const createdBy = at ? lte(products.createdAt, at) : undefined;
  const qty = sql`sum(${stockMovements.qtyDelta})`;
  const valued = db.select({
    costPrice: products.costPrice,
    value: sql`(${qty} * ${products.costPrice})::numeric(18,2)`.as('value'),
  }).from(stockMovements)
    .innerJoin(products, eq(products.id, stockMovements.productId))
    .where(and(eq(stockMovements.orgId, orgId), eq(products.orgId, orgId), eq(products.isActive, true), movedBy))
    .groupBy(products.id).having(sql`${qty} > 0`).as('valued');
  const expiring = db.select({ batchId: batches.id })
    .from(stockMovements).innerJoin(batches, eq(batches.id, stockMovements.batchId))
    .innerJoin(products, eq(products.id, stockMovements.productId))
    .where(and(
      eq(stockMovements.orgId, orgId), eq(batches.orgId, orgId),
      eq(products.orgId, orgId), eq(products.isActive, true), movedBy,
      lte(batches.expiryDate, addDays(refDate, expiringDays))
    )).groupBy(batches.id).having(sql`${qty} > 0`).as('expiring');
  const [[products_], [valuation], [low], [exp]] = await Promise.all([
    db.select({ n: count() }).from(products)
      .where(and(eq(products.orgId, orgId), eq(products.isActive, true), createdBy)),
    db.select({
      totalValue: sql`coalesce(sum(${valued.value}), 0)::numeric(18,2)`,
      missingCost: sql`count(*) filter (where ${valued.costPrice} is null)`.mapWith(Number),
    }).from(valued),
    db.select({ n: count() }).from(products)
      .where(and(eq(products.orgId, orgId), eq(products.isActive, true), createdBy, lowStockCondition(orgId, at))),
    db.select({ n: count() }).from(expiring),
  ]);
  return { totalProducts: products_.n, stockValue: String(valuation.totalValue),
    missingCost: valuation.missingCost, lowStock: low.n, expiringSoon: exp.n };
}
router.get('/summary', asyncHandler(async (req, res) => {
  const { compareDays, expiringDays } = summaryQuery.parse(req.query);
  const { orgId } = req.user;
  const now = new Date();
  const today = utcToday();
  const cutoff = new Date(now.getTime() - compareDays * 86_400_000);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const [cur, prev] = await Promise.all([
    kpisAt(orgId, null, today, expiringDays),
    kpisAt(orgId, cutoff, cutoffDate, expiringDays),
  ]);
  const kpi = (key, extra = {}) => ({
    value: cur[key], previous: prev[key], changePct: pctChange(cur[key], prev[key]), ...extra,
  });
  res.json({ asOf: today, compareDays, expiringDays, kpis: {
    totalProducts: kpi('totalProducts'),
    stockValue: kpi('stockValue', { missingCost: cur.missingCost }),
    lowStock: kpi('lowStock'), expiringSoon: kpi('expiringSoon'),
  } });
}));
router.get('/monthly', asyncHandler(async (req, res) => {
  const { months } = monthlyQuery.parse(req.query);
  const { orgId } = req.user;
  const today = utcToday();
  const keys = lastMonths(today, months);
  const month = sql`to_char(${stockMovements.createdAt} at time zone 'UTC', 'YYYY-MM')`;
  const rows = await db.select({
    month,
    received: sql`coalesce(sum(${stockMovements.qtyDelta}) filter (where ${stockMovements.type} = 'receive'), 0)`.mapWith(Number),
    issued: sql`coalesce(-sum(${stockMovements.qtyDelta}) filter (where ${stockMovements.type} = 'issue'), 0)`.mapWith(Number),
  }).from(stockMovements)
    .where(and(eq(stockMovements.orgId, orgId), inArray(stockMovements.type, ['receive', 'issue']),
      gte(stockMovements.createdAt, monthStart(keys[0]))))
    .groupBy(month);
  res.json({ asOf: today, months, items: fillMonths(keys, rows) });
}));
router.get('/daily', asyncHandler(async (req, res) => {
  const { days } = dailyQuery.parse(req.query);
  const { orgId } = req.user;
  const today = utcToday();
  const keys = lastDays(today, days);
  const day = sql`to_char(${stockMovements.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;
  const rows = await db.select({ day, movements: count() }).from(stockMovements)
    .where(and(eq(stockMovements.orgId, orgId),
      gte(stockMovements.createdAt, new Date(`${keys[0]}T00:00:00Z`))))
    .groupBy(day);
  res.json({ asOf: today, days, items: fillDays(keys, rows) });
}));
export default router;
