import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client.js';

// Run the checked-in Drizzle migrations before the HTTP server begins listening.
// Drizzle records applied migrations in the database, so restarts do not recreate
// tables or delete existing inventory data.
const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../drizzle'
);

export async function ensureDatabaseReady() {
  try {
    console.log('Checking database migrations...');
    await migrate(db, { migrationsFolder });
    console.log('Database migrations are up to date.');
  } catch (err) {
    console.error('Database migration failed; server will not accept requests.', err);
    // Stop rather than serving an app that cannot create accounts or access stock.
    throw err;
  }
}

export async function closeDatabase() {
  await pool.end();
}
