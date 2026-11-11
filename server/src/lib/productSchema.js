// Shared product validation, used by the product routes and the CSV import.
import { z } from 'zod';

const price = z.preprocess(
  (v) => (typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : v),
  z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Must be a non-negative amount with up to 2 decimals')
);

const optionalText = (max) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(max, `Too long (max ${max})`).nullish()
  );

export const createBody = z.object({
  sku: z.string({ required_error: 'Required' }).trim().min(1, 'Required').max(64, 'Too long (max 64)'),
  name: z.string({ required_error: 'Required' }).trim().min(1, 'Required').max(200, 'Too long (max 200)'),
  barcode: optionalText(64),
  category: optionalText(100),
  baseUnit: z.string().trim().min(1, 'Required').max(20, 'Too long (max 20)').default('pcs'),
  costPrice: price.nullish(),
  sellPrice: price.nullish(),
  reorderLevel: z
    .number({ invalid_type_error: 'Must be a whole number' })
    .int('Must be a whole number')
    .min(0, 'Cannot be negative')
    .max(2_000_000_000, 'Too large')
    .default(0),
  trackBatches: z.boolean({ invalid_type_error: 'Must be true or false' }).default(false),
  imageUrl: optionalText(500),
  imagePublicId: optionalText(200),
});
