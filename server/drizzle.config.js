import { defineConfig } from 'drizzle-kit';
import './src/config.js'; // loads the root .env

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.js',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL },
});
