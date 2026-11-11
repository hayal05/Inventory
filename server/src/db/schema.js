// Drizzle schema. Rules: UUID v4 ids, org_id on every tenant table,
// stock is an append-only ledger (stock_movements), never edited in place.
import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  date,
  timestamp,
  check,
  index,
  unique,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const orgs = pgTable('orgs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: createdAt(),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id),
    email: text('email').notNull().unique(), // store lowercased
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [check('users_role_check', sql`${t.role} in ('owner','staff','viewer')`)]
);

export const locations = pgTable('locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  name: text('name').notNull(),
  createdAt: createdAt(),
});

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id),
    sku: text('sku').notNull(),
    barcode: text('barcode'),
    name: text('name').notNull(),
    category: text('category'),
    baseUnit: text('base_unit').notNull().default('pcs'),
    costPrice: numeric('cost_price', { precision: 12, scale: 2 }),
    sellPrice: numeric('sell_price', { precision: 12, scale: 2 }),
    reorderLevel: integer('reorder_level').notNull().default(0),
    trackBatches: boolean('track_batches').notNull().default(false),
    imageUrl: text('image_url'),
    imagePublicId: text('image_public_id'),
    isActive: boolean('is_active').notNull().default(true), // soft delete
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('products_org_sku_unique').on(t.orgId, t.sku),
    index('products_org_barcode_idx').on(t.orgId, t.barcode),
  ]
);

export const batches = pgTable(
  'batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id),
    productId: uuid('product_id').notNull().references(() => products.id),
    batchNo: text('batch_no').notNull(),
    expiryDate: date('expiry_date'), // null = no expiry (sorted last by FEFO)
    createdAt: createdAt(),
  },
  (t) => [unique('batches_product_batch_unique').on(t.productId, t.batchNo)]
);

// Append-only ledger: rows are never updated or deleted.
// Current stock = SUM(qty_delta) grouped by product, batch, location.
// Corrections are reversing entries. All writes go through addMovement().
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id),
    productId: uuid('product_id').notNull().references(() => products.id),
    batchId: uuid('batch_id').references(() => batches.id),
    locationId: uuid('location_id').notNull().references(() => locations.id),
    qtyDelta: integer('qty_delta').notNull(), // + in, - out
    type: text('type').notNull(),
    unitCost: numeric('unit_cost', { precision: 12, scale: 2 }),
    reason: text('reason'),
    refType: text('ref_type'),
    refId: uuid('ref_id'),
    note: text('note'),
    userId: uuid('user_id').notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index('stock_movements_org_product_location_idx').on(t.orgId, t.productId, t.locationId),
    index('stock_movements_org_created_idx').on(t.orgId, t.createdAt),
    check(
      'stock_movements_type_check',
      sql`${t.type} in ('receive','issue','adjust','return','expire')`
    ),
    check('stock_movements_qty_nonzero_check', sql`${t.qtyDelta} <> 0`),
    check('stock_movements_adjust_reason_check', sql`${t.type} <> 'adjust' or ${t.reason} is not null`),
  ]
);
