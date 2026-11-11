# Deployment Guide

## Database: Neon
Create a Neon Postgres project and copy the **pooled** connection string
into `DATABASE_URL`. Use `?sslmode=require`. The server's connection pool
has `max: 3` to accommodate small database plans.

## Images: Cloudinary
Add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and
`CLOUDINARY_API_SECRET` as server environment variables.
The API secret must never be stored in Git or sent to the browser.
The browser uploads directly to Cloudinary using a short-lived signature.

## Render
The root `render.yaml` configures a Node web service. Connect the repo,
select an appropriate region, and supply all non-generated secrets.
- Build: `npm run build`
- Start: `npm start`
- Health: `/health`
- `NODE_ENV=production`
- Do not set `CLIENT_ORIGIN` in same-origin production.

## Database migration
From a trusted terminal with `DATABASE_URL` configured:
```sh
npm run migrate
npm run seed  # optional demo data; not for production
```
Run schema migrations before deploying schema-dependent code.

## Keep-alive monitoring
An uptime service can check the `/health` route every few minutes.
This route does not touch the database so Neon can sleep when unused.

## Backups
The GitHub Actions workflow at `.github/workflows/backup.yml` uses
`pg_dump` to create weekly database snapshots.
Set `BACKUP_DATABASE_URL` (the direct, non-pooled Neon URL) in GitHub
Actions Secrets. Optional `PG_VERSION` defaults to 17.
The backup artifacts contain customer data. Use a private repository
with restricted access before enabling backups.

## Smoke test
1. Visit `/health`, then `/login`.
2. Create a product, upload an image.
3. Receive batch-tracked stock and enter expiry dates.
4. Issue stock and verify the FEFO pick sequence.
5. Check expiry and low-stock screens.
6. Test the app after an idle period for cold-start handling.

## Troubleshooting
- Slow first request: Render/Neon cold start.
- Too many DB connections: verify pooled URL and small pool.
- Missing cookies: check HTTPS and reverse proxy trust.
- Image failures: check Cloudinary keys and signature.
- Refreshing subroutes renders 404: ensure SPA fallback.
- Build failures: review logs, runtime Node version and env vars.
