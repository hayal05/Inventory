// Dashboard routes. Mounted at /api/dashboard. Read-only, all roles. Every query filters on org_id.
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

// The four KPI numbers as they are now (at = null) or as they were at `at` (a Date).
// "As they were" is rebuilt from the ledger (rows created after `at` are ignored), using the
// current cost prices and reorder levels, because those are not versioned.
async function kpisAt(orgId, at, refDate, expiringDays) {
  const movedBy = at ? lte(stockMovements.createdAt, at) : undefined; // and() skips undefined
  const createdBy = at ? lte(products.createdAt, at) : undefined;

  const qty = sql`sum(${stockMovements.qtyDelta})`;
  const valued = db
    .select({
      costPrice: products.costPrice,
      value: sql`(${qty} * ${products.costPrice})::numeric(18,2)`.as('value'),
    })
    .from(stockMovements)
    .innerJoin(products, eq(products.id, stockMovements.productId))
    .where(and(eq(stockMovements.orgId, orgId), eq(products.orgId, orgId), eq(products.isActive, true), movedBy))
    .groupBy(products.id)
    .having(sql`${qty} > 0`)
    .as('valued');

  const expiring = db
    .select({ batchId: batches.id })
    .from(stockMovements)
    .innerJoin(batches, eq(batches.id, stockMovements.batchId))
    .innerJoin(products, eq(products.id, stockMovements.productId))
    .where(
      and(
        eq(stockMovements.orgId, orgId),
        eq(batches.orgId, orgId),
        eq(products.orgId, orgId),
        eq(products.isActive, true),
        movedBy,
        lte(batches.expiryDate, addDays(refDate, expiringDays)) // also excludes null expiry
      )
    )
    .groupBy(batches.id)
    .having(sql`${qty} > 0`)
    .as('expiring');

  const [[products_], [valuation], [low], [exp]] = await Promise.all([
    db
      .select({ n: count() })
      .from(products)
      .where(and(eq(products.orgId, orgId), eq(products.isActive, true), createdBy)),
    db
      .select({
        totalValue: sql`coalesce(sum(${valued.value}), 0)::numeric(18,2)`,
        missingCost: sql`count(*) filter (where ${valued.costPrice} is null)`.mapWith(Number),
      })
      .from(valued),
    db
      .select({ n: count() })
      .from(products)
      .where(and(eq(products.orgId, orgId), eq(products.isActive, true), createdBy, lowStockCondition(orgId, at))),
    db.select({ n: count() }).from(expiring),
  ]);

  return {
    totalProducts: products_.n,
    stockValue: String(valuation.totalValue),
    missingCost: valuation.missingCost,
    lowStock: low.n,
    expiringSoon: exp.n,
  };
}

// GET /api/dashboard/summary?compareDays=30&expiringDays=30
// The 4 KPI cards, each { value, previous, changePct }: total products, stock value, low stock,
// expiring soon. `previous` is the same figure compareDays days ago (default 30, max 365),
// rebuilt from the ledger; changePct is the change in percent, 1 decimal, and null when the
// previous value was 0 and the value is not (no percentage exists).
//  - totalProducts: active products. The previous count only has products created by then, and
//    a product deleted since is not counted at all (no deleted-at date is kept), so it is a little low.
//  - stockValue: on hand x current cost price, as an exact string; missingCost = products with
//    stock but no cost price (when above 0 the value is understated).
//  - lowStock: same rule as the low-stock report (reorder level 0 = not set).
//  - expiringSoon: batches with stock expiring within expiringDays (default 30, max 365),
//    counting already-expired batches still on hand, like the expiring report.
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
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
      value: cur[key],
      previous: prev[key],
      changePct: pctChange(cur[key], prev[key]),
      ...extra,
    });

    res.json({
      asOf: today,
      compareDays,
      expiringDays,
      kpis: {
        totalProducts: kpi('totalProducts'),
        stockValue: kpi('stockValue', { missingCost: cur.missingCost }),
        lowStock: kpi('lowStock'),
        expiringSoon: kpi('expiringSoon'),
      },
    });
  })
);

// GET /api/dashboard/monthly?months=12
// Units received vs issued per month, for the dashboard chart. `months` (default 12, max 24) is
// how many months to return, ending with the current UTC month, oldest first. Every month in
// the range is present, with 0 and 0 when nothing moved.
//  - received: units on `receive` rows. issued: units on `issue` rows, as a positive number.
//  - Adjustments, returns and expiry write-offs are not counted (they are corrections, not
//    stock coming in or going out through the shop).
//  - Counts all movements, including those of products deleted since, because it is a history
//    of what happened; the summary KPIs only count active products.
//  - Months are UTC (a movement near midnight in Ethiopia, UTC+3, can land in the neighbouring
//    month), like the rest of the date handling.
router.get(
  '/monthly',
  asyncHandler(async (req, res) => {
    const { months } = monthlyQuery.parse(req.query);
    const { orgId } = req.user;

    const today = utcToday();
    const keys = lastMonths(today, months);
    const month = sql`to_char(${stockMovements.createdAt} at time zone 'UTC', 'YYYY-MM')`;

    const rows = await db
      .select({
        month,
        received: sql`coalesce(sum(${stockMovements.qtyDelta}) filter (where ${stockMovements.type} = 'receive'), 0)`.mapWith(Number),
        issued: sql`coalesce(-sum(${stockMovements.qtyDelta}) filter (where ${stockMovements.type} = 'issue'), 0)`.mapWith(Number),
      })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.orgId, orgId),
          inArray(stockMovements.type, ['receive', 'issue']),
          gte(stockMovements.createdAt, monthStart(keys[0]))
        )
      )
      .groupBy(month);

    res.json({ asOf: today, months, items: fillMonths(keys, rows) });
  })
);

// GET /api/dashboard/daily?days=14
// Number of ledger movements (every type, so adjustments and write-offs count too: it is a
// measure of activity) per UTC day, for the small bar chart. `days` (default 14, max 90) is how
// many days to return, ending with today, oldest first. Every day is present, with 0 when
// nothing moved. Counts movements of all products, including ones deleted since.
router.get(
  '/daily',
  asyncHandler(async (req, res) => {
    const { days } = dailyQuery.parse(req.query);
    const { orgId } = req.user;

    const today = utcToday();
    const keys = lastDays(today, days);
    const day = sql`to_char(${stockMovements.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;

    const rows = await db
      .select({ day, movements: count() })
      .from(stockMovements)
      .where(and(eq(stockMovements.orgId, orgId), gte(stockMovements.createdAt, new Date(`${keys[0]}T00:00:00Z`))))
      .groupBy(day);

    res.json({ asOf: today, days, items: fillDays(keys, rows) });
  })
);

export default router;
