# Architecture

## Request flow
Browser (React Vite app) → Express API on Render → pooled Neon Postgres.
Direct browser → Cloudinary uploads are signed by the Express server.
Production Express serves the built `client/dist` as the same origin as API.

## Data model
- `orgs`: organization with UUID primary key
- `users`: organization, email, Argon2 password hash and role (`owner`, `staff`, `viewer`)
- `locations`: stores, keyed by organization
- `products`: SKU (unique per organization), name, barcode, category, unit, cost/sell price, reorder level, optional image and batch-tracking flag
- `batches`: product, batch number, expiry date, organization
- `stock_movements`: append-only inventory ledger with product, batch, location, signed quantity, movement type, reason, user and timestamp

Full schema is in `server/src/db/schema.js`; initial migration in `server/drizzle/0000_init.sql`.

## Stock ledger rules
1. On-hand stock is the sum of `stock_movements.qty_delta` by product, batch and location.
2. Never overwrite or delete a movement: record reversing adjustments.
3. All movement writes are transactional and organization scoped.
4. Prevent negative stock by checking availability under a product row lock.
5. Adjustment requires a reason.
6. Batch-tracked products require a batch number and expiry date on receipt.

## FEFO
When issuing batch-tracked stock, use the earliest-expiring usable batch first.
Expired batches are not eligible for issue. Check that all required stock is available
before committing the issue and write one movement per selected batch.

## Permissions
| Role | Permissions |
|---|---|
| Owner | All operations, users/settings |
| Staff | Products, receiving, issuing, adjusting, reports |
| Viewer | Read only |

## API
| Method | Route | Purpose |
|---|---|---|
| GET | `/health` | No-database availability check |
| POST | `/api/auth/register` | Organization and first owner |
| POST | `/api/auth/login` | Login with httpOnly cookie |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Current user |
| GET, POST | `/api/products` | List/create products |
| GET, PUT, DELETE | `/api/products/:id` | Read/update/soft-delete |
| POST | `/api/products/import` | CSV validation/import |
| GET | `/api/products/:id/movements` | Product ledger |
| GET | `/api/uploads/sign` | Cloudinary upload signature |
| GET | `/api/stock` | Stock by product and location |
| POST | `/api/stock/receive` | Receive delivery |
| POST | `/api/stock/issue` | FEFO issue |
| POST | `/api/stock/adjust` | Adjust with reason |
| GET | `/api/reports/low-stock` | Reorder warnings |
| GET | `/api/reports/expiring` | Expiring batches |
| GET | `/api/reports/valuation` | Inventory valuation |
| GET | `/api/dashboard/summary` | KPI summary |
| GET | `/api/dashboard/monthly` | Monthly receive/issue |
| GET | `/api/dashboard/daily` | Daily movement counts |

## CSV import
Columns: `sku,name,barcode,category,base_unit,cost_price,sell_price,reorder_level,track_batches`.
Preview is the default; `?commit=true` saves validated rows.

## Security
Use Argon2 passwords, signed httpOnly Secure SameSite=Lax cookies, Helmet,
rate limits, Zod input validation and organization-scoped queries. Keep all
secrets outside the repository.
