// Shared "low stock" rule, used by GET /api/reports/low-stock and GET /api/products?lowStock=true.
import { sql } from 'drizzle-orm';
import { products, stockMovements } from '../db/schema.js';

export const onHandExpr = (orgId, at = null) => sql`coalesce((
  select sum(${sql.raw('"stock_movements"."qty_delta"')})
  from ${stockMovements}
  where ${sql.raw('"stock_movements"."product_id"')} = ${sql.raw('"products"."id"')}
    and ${sql.raw('"stock_movements"."org_id"')} = ${orgId}
    ${at ? sql`and ${sql.raw('"stock_movements"."created_at"')} <= ${at}` : sql``}
), 0)::int`;

export const lowStockCondition = (orgId, at = null) =>
  sql`${products.reorderLevel} > 0 and ${onHandExpr(orgId, at)} <= ${products.reorderLevel}`;
