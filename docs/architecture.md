# Architecture

## Folder structure
```
inventory/
├─ package.json              # root scripts: build, start, dev
├─ render.yaml
├─ .env.example
├─ .gitignore
├─ .github/workflows/backup.yml
├─ server/
│  ├─ package.json
│  ├─ drizzle.config.js
│  ├─ drizzle/               # generated migrations
│  └─ src/
│     ├─ index.js            # app bootstrap, static serving
│     ├─ config.js           # env parsing
│     ├─ db/
│     │  ├─ client.js        # pg Pool (max 3) + drizzle
│     │  ├─ schema.js
│     │  └─ seed.js
│     ├─ middleware/         # auth, roles, errors, rate limit
│     ├─ lib/                # ledger.js, fefo.js, cloudinary.js, csv.js
│     └─ routes/             # auth, products, stock, reports, dashboard, uploads
└─ client/
   ├─ package.json
   ├─ vite.config.js
   └─ src/
      ├─ main.jsx
      ├─ theme.css
      ├─ api/                # fetch helper, react-query hooks
      ├─ components/         # Card, Badge, Button, Sidebar, KpiCard, ...
      ├─ pages/              # Login, Dashboard, Products, Stock, Expiry, ...
      └─ routes.jsx
```

## Request flow
Browser (React PWA) → Express on Render → Neon Postgres (pooled).
Images go browser → Cloudinary directly, using a signature from Express.
In production Express also serves `client/dist`, so everything is same-origin.

## Database schema (MVP)

```
orgs
  id uuid pk, name text, created_at timestamptz

users
  id uuid pk, org_id fk, email text unique, password_hash text,
  role text check in ('owner','staff','viewer'), is_active bool, created_at

locations
  id uuid pk, org_id fk, name text, created_at

products
  id uuid pk, org_id fk, sku text, barcode text, name text, category text,
  base_unit text default 'pcs',
  cost_price numeric(12,2), sell_price numeric(12,2),
  reorder_level int default 0,
  track_batches bool default false,
  image_url text, image_public_id text,
  is_active bool default true, created_at, updated_at
  unique (org_id, sku)
  index (org_id, barcode)

batches
  id uuid pk, org_id fk, product_id fk, batch_no text, expiry_date date,
  created_at
  unique (product_id, batch_no)

stock_movements            -- append-only ledger
  id uuid pk, org_id fk, product_id fk, batch_id fk null, location_id fk,
  qty_delta int not null,           -- + in, - out
  type text check in ('receive','issue','adjust','return','expire'),
  unit_cost numeric(12,2) null,
  reason text null,                 -- required for adjust
  ref_type text null, ref_id uuid null,
  note text null,
  user_id fk, created_at timestamptz default now()
  index (org_id, product_id, location_id)
  index (org_id, created_at)
```

**Optional later:** a `stock_levels` summary table (org, product, batch, location, qty) updated in the same transaction as each movement, if the ledger grows large.
**Phase 2 tables:** `partners`, `purchase_orders`, `sales` (+ line items), `product_units`.

## Ledger rules
1. Current stock = `SUM(qty_delta)` grouped by product, batch, and location.
2. Rows are never updated or deleted. Fix mistakes with a reversing entry.
3. All writes go through one helper, `addMovement()`, inside a DB transaction.
4. Issue and negative adjustments must be rejected if the result would go below zero.
5. Lock the affected product's rows (`SELECT ... FOR UPDATE`) during an issue to avoid two cashiers overselling the same stock.
6. `adjust` requires a `reason`.
7. Receive on a `track_batches` product requires `batch_no` and `expiry_date`.

## FEFO (first-expiry-first-out)
For an issue of `qty` on a product with `track_batches`:
1. Compute on-hand per batch at the location (SUM of ledger).
2. Keep batches with on-hand > 0 and not expired.
3. Order by `expiry_date` ascending (batches with no expiry last).
4. Draw from batches in that order until `qty` is met.
5. Write one `issue` movement per batch drawn.
6. If total available < `qty`, reject with a clear error.

For products with `track_batches = false`, issue directly with no batch.

## Roles
| Role | Can do |
|---|---|
| owner | Everything, including users and settings |
| staff | Products, receive, issue, adjust, reports |
| viewer | Read-only |

## API endpoints
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/health` | public | No DB call |
| POST | `/auth/register` | public | Creates org + owner |
| POST | `/auth/login` | public | Sets httpOnly cookie; rate limited |
| POST | `/auth/logout` | any | Clears cookie |
| GET | `/auth/me` | any | Current user and org |
| GET | `/products` | any | `q`, `page`, `limit`, `lowStock`; each item includes `onHand` |
| POST | `/products` | staff+ | |
| GET | `/products/:id` | any | One active product, includes `onHand` |
| PUT | `/products/:id` | staff+ | |
| DELETE | `/products/:id` | staff+ | Soft delete (`is_active=false`) |
| POST | `/products/import` | staff+ | CSV body (`text/csv`); preview by default, `?commit=true` saves valid rows; per-row errors |
| GET | `/products/:id/movements` | any | Ledger history |
| GET | `/uploads/sign` | staff+ | Cloudinary signature |
| POST | `/stock/receive` | staff+ | Optional batch and expiry |
| POST | `/stock/issue` | staff+ | FEFO |
| POST | `/stock/adjust` | staff+ | Reason required |
| GET | `/stock` | any | Levels per product and location |
| GET | `/reports/low-stock` | any | `page`, `limit`; total on hand <= reorder level (level 0 = not set) |
| GET | `/reports/expiring?days=90` | any | Batches with stock expiring within `days`, plus expired-but-on-hand; per batch and location |
| GET | `/reports/valuation` | any | On hand x cost price; totals plus paginated per-product rows; missing cost counted |
| GET | `/dashboard/summary` | any | `compareDays`, `expiringDays`; 4 KPIs, each value, previous, changePct |
| GET | `/dashboard/monthly` | any | `months` (1-24, default 12); units received vs issued per UTC month, zero-filled, oldest first |
| GET | `/dashboard/daily` | any | `days` (1-90, default 14); number of ledger movements per UTC day, zero-filled, oldest first |

## CSV import format (products)
Columns: `sku, name, barcode, category, base_unit, cost_price, sell_price, reorder_level, track_batches`
- `track_batches` accepts `true/false/yes/no/1/0`.
- Rows are validated one by one; the response lists each failing row with its error (row 1 is the header).
- Valid rows are imported only if the user confirms: call without `commit` for a preview, then again with `?commit=true`.

## Error format
```json
{ "error": { "code": "INSUFFICIENT_STOCK", "message": "Only 12 available", "fields": {} } }
```
Common codes: `VALIDATION`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INSUFFICIENT_STOCK`.

## Security checklist
- Argon2 password hashes
- httpOnly + Secure + SameSite=Lax cookie
- Helmet headers with a CSP (`middleware/security.js`)
- Rate limit on login (10 failed per 15 min per IP) and register (5 per hour), `middleware/rateLimit.js`
- CORS off by default (same-origin); `CLIENT_ORIGIN` opts in
- zod validation on all inputs
- `org_id` filter on every query (add a test that proves one org cannot read another's data)
- Cloudinary secret server-side only
- No secrets in git
