import { z } from 'zod';

export const isoDate = z.string({ required_error: 'Required' }).trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Not a real date');
const blankToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);
export const receiveBody = z.object({
  productId: z.string({ required_error: 'Required' }).uuid('Invalid id'),
  locationId: z.preprocess(blankToNull, z.string().uuid('Invalid id').nullish()),
  qty: z.number({ required_error: 'Required', invalid_type_error: 'Must be a whole number' })
    .int('Must be a whole number').min(1, 'Must be at least 1').max(2_000_000_000, 'Too large'),
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
  qtyDelta: z.number({ required_error: 'Required', invalid_type_error: 'Must be a whole number' })
    .int('Must be a whole number').refine((n) => n !== 0, 'Cannot be zero')
    .refine((n) => Math.abs(n) <= 2_000_000_000, 'Too large'),
  reason: z.string({ required_error: 'Required' }).trim().min(1, 'Required').max(200, 'Too long (max 200)'),
  note: z.preprocess(blankToNull, z.string().trim().max(500, 'Too long (max 500)').nullish()),
});
export const flag = z.enum(['true', 'false'], { errorMap: () => ({ message: 'Use true or false' }) })
  .optional().transform((v) => v === 'true');
export const levelsQuery = z.object({
  q: z.string().trim().max(100, 'Too long (max 100)').optional(),
  productId: z.string().uuid('Invalid id').optional(),
  locationId: z.string().uuid('Invalid id').optional(),
  includeZero: flag,
  includeBatches: flag,
  page: z.coerce.number().int('Must be a whole number').min(1, 'Must be at least 1').default(1),
  limit: z.coerce.number().int('Must be a whole number').min(1, 'Must be at least 1').max(100, 'Max 100 per page').default(20),
});
export const movementsQuery = z.object({
  type: z.enum(['receive', 'issue', 'adjust', 'return', 'expire'], {
    errorMap: () => ({ message: 'Must be one of receive, issue, adjust, return, expire' }),
  }).optional(),
  locationId: z.string().uuid('Invalid id').optional(),
  page: z.coerce.number().int('Must be a whole number').min(1, 'Must be at least 1').default(1),
  limit: z.coerce.number().int('Must be a whole number').min(1, 'Must be at least 1').max(100, 'Max 100 per page').default(20),
});
export const issueBody = z.object({
  productId: z.string({ required_error: 'Required' }).uuid('Invalid id'),
  locationId: z.preprocess(blankToNull, z.string().uuid('Invalid id').nullish()),
  qty: z.number({ required_error: 'Required', invalid_type_error: 'Must be a whole number' })
    .int('Must be a whole number').min(1, 'Must be at least 1').max(2_000_000_000, 'Too large'),
  note: z.preprocess(blankToNull, z.string().trim().max(500, 'Too long (max 500)').nullish()),
});
export const lowStockQuery = z.object({
  page: z.coerce.number().int('Must be a whole number').min(1, 'Must be at least 1').default(1),
  limit: z.coerce.number().int('Must be a whole number').min(1, 'Must be at least 1').max(100, 'Max 100 per page').default(20),
});
export const expiringQuery = z.object({
  days: z.coerce.number().int('Must be a whole number').min(1, 'Must be at least 1').max(365, 'Max 365').default(90),
  page: z.coerce.number().int('Must be a whole number').min(1, 'Must be at least 1').default(1),
  limit: z.coerce.number().int('Must be a whole number').min(1, 'Must be at least 1').max(100, 'Max 100 per page').default(20),
});
export const valuationQuery = lowStockQuery;
const dayCount = (def) =>
  z.coerce.number().int('Must be a whole number').min(1, 'Must be at least 1').max(365, 'Max 365').default(def);
export const summaryQuery = z.object({ compareDays: dayCount(30), expiringDays: dayCount(30) });
export const monthlyQuery = z.object({
  months: z.coerce.number().int('Must be a whole number').min(1, 'Must be at least 1').max(24, 'Max 24').default(12),
});
export const dailyQuery = z.object({
  days: z.coerce.number().int('Must be a whole number').min(1, 'Must be at least 1').max(90, 'Max 90').default(14),
});
