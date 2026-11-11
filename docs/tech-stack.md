# Tech Stack

Install the latest stable version of each package when you start, and commit the lockfile.

## Overview
| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js 20 LTS or newer | Stable, fits Render free |
| Backend | Express | Simple, well known, light on memory |
| Frontend | React + Vite | Fast builds, easy PWA |
| Database | Neon Postgres (pooled connection) | Free serverless Postgres, scales to zero |
| ORM and migrations | Drizzle ORM + drizzle-kit | Light, SQL-like, typed migrations |
| Image storage | Cloudinary | Free tier, on-the-fly resize and compress |
| Hosting | Render free web service | One service for API and UI |
| Keep-alive | UptimeRobot or cron-job.org | Prevents Render sleep |
| Backups | GitHub Actions + `pg_dump` | Free weekly backup |
| Language | JavaScript (TypeScript optional) | Pick one at task 1 and stay with it |

## Backend libraries
| Purpose | Package |
|---|---|
| Web framework | `express` |
| Postgres driver | `pg` (node-postgres) with a Pool, `max: 3` |
| ORM | `drizzle-orm`, `drizzle-kit` (dev) |
| Validation | `zod` |
| Password hashing | `argon2` |
| Sessions | `jsonwebtoken` in an httpOnly, Secure, SameSite=Lax cookie |
| Cookies | `cookie-parser` |
| Security headers | `helmet` |
| Rate limiting | `express-rate-limit` (auth routes) |
| CORS | `cors` (only needed for local dev, since prod is same-origin) |
| CSV import | `multer` (memory storage) + `csv-parse` |
| Cloudinary | none: upload signing is ~10 lines of `node:crypto` in `server/src/lib/cloudinary.js` (the `cloudinary` SDK is not needed) |
| Logging | `pino` + `pino-http` |
| Dev tooling | `nodemon`, `dotenv` |

## Frontend libraries
| Purpose | Package |
|---|---|
| UI | `react`, `react-dom` |
| Routing | `react-router-dom` |
| Server state and caching | `@tanstack/react-query` |
| Charts | `recharts` |
| Icons | `lucide-react` |
| Toasts | `sonner` or `react-hot-toast` |
| Barcode scanning | Browser `BarcodeDetector` API with `@zxing/browser` as fallback |
| PWA | `vite-plugin-pwa` |
| Styling | Plain CSS with variables (`theme.css`) and CSS modules, no heavy UI kit |
| Forms | `react-hook-form` + `zod` resolver (optional) |

## Image handling (Cloudinary)
1. Client asks `GET /uploads/sign` for a short-lived signature.
2. Client uploads the file **directly** to Cloudinary with that signature.
3. Client saves `image_url` and `image_public_id` on the product.
4. Display URLs use transformations: `f_auto,q_auto,w_400`.
5. The API secret never leaves the server.

## Conventions
- **Money:** `numeric(12,2)`. Never use floats for money in JS; convert at the edge.
- **Quantities:** integers in the product's base unit (unit conversion is phase 2).
- **IDs:** UUID v4 (`gen_random_uuid()`).
- **Timestamps:** `timestamptz`, stored in UTC.
- **Dates (expiry):** `date`.
- **API style:** JSON, REST, plural nouns, errors as `{ error: { code, message, fields? } }`.
- **Auth:** same-origin cookie, so no tokens in localStorage.
- **Validation:** every request body is parsed by a zod schema before use.

## Environment variables
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string |
| `JWT_SECRET` | Long random string for signing sessions |
| `CLOUDINARY_CLOUD_NAME` | From the Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | From the Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | From the Cloudinary dashboard (server only) |
| `NODE_ENV` | `development` or `production` |
| `PORT` | Set by Render automatically |
| `CLIENT_ORIGIN` | Dev-only CORS origin (for example `http://localhost:5173`) |

## Free-tier limits to remember
- **Render free:** sleeps after about 15 minutes idle; ephemeral disk; limited RAM (512 MB).
- **Neon free:** scales to zero when idle (cold start on first query); about 0.5 GB storage per project.
- **Cloudinary free:** monthly credit-based limits for storage, transformations, and bandwidth.
- Limits change over time, so confirm current numbers on each provider's pricing page.

## Out of scope for the MVP
Purchase orders, sales and customers, transfers between locations, unit conversions (carton to piece), email notifications, and a staff activity log.
