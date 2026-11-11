// Validation for stock endpoints.
import { z } from 'zod';

// Real calendar date as YYYY-MM-DD (rejects 2026-02-30).
export const isoDate = z
  .string({ required_error: 'Required' })
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Not a real date');

const blankToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);

export const receiveBody = z.object({
  productId: z.string({ required_error: 'Required' }).uuid('Invalid id'),
  // Optional: defaults to the org's first location (the "Main store" made at registration).
  locationId: z.preprocess(blankToNull, z.string().uuid('Invalid id').nullish()),
  qty: z
    .number({ required_error: 'Required', invalid_type_error: 'Must be a whole number' })
    .int('Must be a whole number')
    .min(1, 'Must be at least 1')
    .max(2_000_000_000, 'Too large'),
  unitCost: z.preprocess(
    (v) => (typeof v === 'number' ? String(v) : typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v),
    z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Must be a non-negative amount with up to 2 decimals').nullish()
  ),
  batchNo: z.preprocess(blankToNull, z.string().trim().max(64, 'Too long (max 64)').nullish()),
  expiryDate: z.preprocess(blankToNull, isoDate.nullish()),
  note: z.preprocess(blankToNull, z.string().trim().max(500, 'Too long (max 500)').nullish()),
});

export const adjustBody = z.object({
  productId: z.string({ required_error: 'Required' }).uuid('Invalid id'),
  locationId: z.preprocess(blankToNull, z.string().uuid('Invalid id').nullish()),
  batchId: z.preprocess(blankToNull, z.string().uuid('Invalid id').nullish()),
  qtyDelta: z
    .number({ required_error: 'Required', invalid_type_error: 'Must be a whole number' })
    .int('Must be a whole number')
    .refine((n) => n !== 0, 'Cannot be zero')
    .refine((n) => Math.abs(n) <= 2_000_000_000, 'Too large'),
  reason: z
    .string({ required_error: 'Required' })
    .trim()
    .min(1, 'Required')
    .max(200, 'Too long (max 200)'),
  note: z.preprocess(blankToNull, z.string().trim().max(500, 'Too long (max 500)').nullish()),
});

// Query string for GET /api/stock. Booleans arrive as the text "true" or "false".
export const flag = z
  .enum(['true', 'false'], { errorMap: () => ({ message: 'Use true or false' }) })
  .optional()
  .transform((v) => v === 'true');

export const levelsQuery = z.object({
  q: z.string().trim().max(100, 'Too long (max 100)').optional(),
  productId: z.string().uuid('Invalid id').optional(),
  locationId: z.string().uuid('Invalid id').optional(),
  // Rows whose stock is exactly 0 are hidden unless asked for.
  includeZero: flag,
  // Adds a per-batch breakdown to each row (only filled for batch-tracked products).
  includeBatches: flag,
  page: z.coerce.number().int('Must be a whole number').min(1, 'Must be at least 1').default(1),
  limit: z.coerce
    .number()
    .int('Must be a whole number')
    .min(1, 'Must be at least 1')
    .max(100, 'Max 100 per page')
    .default(20),
});

// Query string for GET /api/products/:id/movements.
export const movementsQuery = z.object({
  type: z.enum(['receive', 'issue', 'adjust', 'return', 'expire'], {
    errorMap: () => ({ message: 'Must be one of receive, issue, adjust, return, expire' }),
  }).optional(),
  locationId: z.string().uuid('Invalid id').optional(),
  page: z.coerce.number().int('Must be a whole number').min(1, 'Must be at least 1').default(1),
  limit: z.coerce
    .number()
    .int('Must be a whole number')
    .min(1, 'Must be at least 1')
    .max(100, 'Max 100 per page')
    .default(20),
});

// Body for POST /api/stock/issue. `qty` is positive; the ledger row is stored negative.
export const issueBody = z.object({
  productId: z.string({ required_error: 'Required' }).uuid('Invalid id'),
  locationId: z.preprocess(blankToNull, z.string().uuid('Invalid id').nullish()),
  qty: z
    .number({ required_error: 'Required', invalid_type_error: 'Must be a whole number' })
    .int('Must be a whole number')
    .min(1, 'Must be at least 1')
    .max(2_000_000_000, 'Too large'),
  note: z.preprocess(blankToNull, z.string().trim().max(500, 'Too long (max 500)').nullish()),
});

// Query string for GET /api/reports/low-stock.
export const lowStockQuery = z.object({
  page: z.coerce.number().int('Must be a whole number').min(1, 'Must be at least 1').default(1),
  limit: z.coerce
    .number()
    .int('Must be a whole number')
    .min(1, 'Must be at least 1')
    .max(100, 'Max 100 per page')
    .default(20),
});

// Query string for GET /api/reports/expiring.
export const expiringQuery = z.object({
  // Look-ahead window. Batches already expired (with stock left) are always included.
  days: z.coerce
    .number()
    .int('Must be a whole number')
    .min(1, 'Must be at least 1')
    .max(365, 'Max 365')
    .default(90),
  page: z.coerce.number().int('Must be a whole number').min(1, 'Must be at least 1').default(1),
  limit: z.coerce
    .number()
    .int('Must be a whole number')
    .min(1, 'Must be at least 1')
    .max(100, 'Max 100 per page')
    .default(20),
});

// Query string for GET /api/reports/valuation: same paging as the low-stock report.
export const valuationQuery = lowStockQuery;

// Query string for GET /api/dashboard/summary.
const dayCount = (def) =>
  z.coerce.number().int('Must be a whole number').min(1, 'Must be at least 1').max(365, 'Max 365').default(def);
export const summaryQuery = z.object({
  compareDays: dayCount(30), // how far back the "previous" figures are taken
  expiringDays: dayCount(30), // window of the "expiring soon" KPI
});

// Query string for GET /api/dashboard/monthly.
export const monthlyQuery = z.object({
  // How many months to return, ending with the current (UTC) month.
  months: z.coerce.number().int('Must be a whole number').min(1, 'Must be at least 1').max(24, 'Max 24').default(12),
});

// Query string for GET /api/dashboard/daily.
export const dailyQuery = z.object({
  // How many days to return, ending with today (UTC).
  days: z.coerce.number().int('Must be a whole number').min(1, 'Must be at least 1').max(90, 'Max 90').default(14),
});
