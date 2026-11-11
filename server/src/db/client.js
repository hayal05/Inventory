import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { requireEnv } from '../config.js';
import * as schema from './schema.js';

// Neon free tier has a low connection cap, so keep the pool small.
// DATABASE_URL must be the POOLED connection string.
export const pool = new pg.Pool({
  connectionString: requireEnv('DATABASE_URL'),
  max: 3,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 15_000, // allows for Neon cold starts
});

// Idle clients can be dropped by Neon; log instead of crashing the process.
pool.on('error', (err) => console.error('Unexpected pg pool error:', err.message));

export const db = drizzle(pool, { schema });
