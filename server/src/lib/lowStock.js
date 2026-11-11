// Shared "low stock" rule, used by GET /api/reports/low-stock and GET /api/products?lowStock=true.
//
// On hand = SUM of the ledger for the product across all locations (never stored anywhere).
// A product is low when 0 < reorder_level and on hand <= reorder_level. A reorder level of 0 is
// the default and means "no level set", so those products are not flagged.
// Only meaningful inside a query that selects FROM products (the subquery refers to products.id).
import { sql } from 'drizzle-orm';
import { products, stockMovements } from '../db/schema.js';

// Products never received have no ledger rows; coalesce makes their on hand 0.
// `at` (a Date, optional) gives the on hand as it was at that moment, by ignoring later
// ledger rows; the dashboard uses it for its "compared with before" figures.
// The column names are written out in full on purpose. Drizzle drops table prefixes when a
// query has a single table, which turned `product_id = products.id` into `product_id = id`
// (the inner table's own id), so on hand came out 0 for every product.
export const onHandExpr = (orgId, at = null) => sql`coalesce((
  select sum(${sql.raw('"stock_movements"."qty_delta"')})
  from ${stockMovements}
  where ${sql.raw('"stock_movements"."product_id"')} = ${sql.raw('"products"."id"')}
    and ${sql.raw('"stock_movements"."org_id"')} = ${orgId}
    ${at ? sql`and ${sql.raw('"stock_movements"."created_at"')} <= ${at}` : sql``}
), 0)::int`;

export const lowStockCondition = (orgId, at = null) =>
  sql`${products.reorderLevel} > 0 and ${onHandExpr(orgId, at)} <= ${products.reorderLevel}`;
