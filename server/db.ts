import pkg from 'pg';
const { Pool } = pkg;
import * as schema from "../shared/schema.js";
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePGlite } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Choose driver based on env
const usePGlite = !process.env.DATABASE_URL || process.env.USE_PGLITE === 'true';

let pool: InstanceType<typeof Pool> | undefined;
let db: any; // drizzle instance (node-postgres or pglite)

if (usePGlite) {
  // Embedded Postgres (no Docker, no external server)
  const dataDir = process.env.PGLITE_DIR && process.env.PGLITE_DIR.trim().length > 0
    ? process.env.PGLITE_DIR
    : undefined;

  const client = dataDir ? new PGlite({ dataDir } as any) : new PGlite();

  // Apply SQL migrations to embedded DB (best-effort) without blocking module init
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const migrationPath = resolve(__dirname, '../migrations/development/0000_shiny_smiling_tiger.sql');
    const sql = readFileSync(migrationPath, 'utf8');
    // Split on drizzle statement-breakpoint comments to execute sequentially
    const statements = sql
      .split(/--\>\s*statement-breakpoint/g)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    void (async () => {
      try {
        for (const stmt of statements) {
          // eslint-disable-next-line no-await-in-loop
          await client.query(stmt);
        }
        console.log('✅ Embedded PGlite database initialized with migrations');
      } catch (e) {
        console.warn('⚠️ Failed to load migrations into embedded DB:', e);
      }
    })();
  } catch (err) {
    console.warn('⚠️ No migrations applied to embedded DB:', err);
    // Fallback: Ensure minimal schema/tables exist so core features work
    // Choose schema similar to shared/schema.ts logic: production => public, else development
    const targetSchema = (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production')
      ? 'public'
      : 'development';
    void (async () => {
      try {
        if (targetSchema !== 'public') {
          await client.query(`CREATE SCHEMA IF NOT EXISTS "${targetSchema}"`);
        }
        const schemaPrefix = targetSchema === 'public' ? 'public' : '"' + targetSchema + '"';
        await client.query(`
          CREATE TABLE IF NOT EXISTS ${schemaPrefix}."preferences" (
            id serial PRIMARY KEY,
            device_id text NOT NULL,
            genres text[] NOT NULL,
            authors text[],
            books text[],
            goodreads_data jsonb
          );
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS ${schemaPrefix}."saved_books" (
            id serial PRIMARY KEY,
            device_id text NOT NULL,
            book_cache_id integer,
            title text NOT NULL,
            author text NOT NULL,
            cover_url text,
            rating text,
            summary text,
            saved_at timestamp DEFAULT now()
          );
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS ${schemaPrefix}."book_cache" (
            id serial PRIMARY KEY,
            title text NOT NULL,
            author text NOT NULL,
            isbn varchar(30),
            book_id text NOT NULL,
            cover_url text,
            rating varchar(10),
            summary text,
            source varchar(20) NOT NULL,
            metadata jsonb,
            cached_at timestamp DEFAULT now(),
            expires_at timestamp,
            CONSTRAINT book_cache_isbn_unique UNIQUE(isbn),
            CONSTRAINT book_cache_book_id_unique UNIQUE(book_id)
          );
        `);
        console.log('✅ Embedded PGlite database initialized with fallback schema');
      } catch (fallbackErr) {
        console.warn('⚠️ Failed to initialize fallback schema for embedded DB:', fallbackErr);
      }
    })();
  }

  db = drizzlePGlite(client, { schema });
} else {
  // Real Postgres connection via node-postgres
  pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: process.env.NODE_ENV === 'production' ? 1 : 20,
    idleTimeoutMillis: process.env.NODE_ENV === 'production' ? 1000 : 30000,
    connectionTimeoutMillis: process.env.NODE_ENV === 'production' ? 5000 : 2000,
    allowExitOnIdle: process.env.NODE_ENV === 'production',
  });

  // Add error handling for the pool
  pool.on('error', (err: any) => {
    console.error('Database pool error:', err);
  });

  db = drizzleNodePg({ client: pool as any, schema });
}

export { pool };
export { db };

// Helper function to test database connectivity
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    if (usePGlite) {
      // PGlite path: run a simple query through drizzle
      const result = await db.execute("SELECT 1 as test");
      const row = Array.isArray(result) ? (result[0] as any) : (result as any);
      console.log('Embedded DB connection test successful');
      return (row?.test ?? row?.rows?.[0]?.test) === 1;
    } else {
      const client = await (pool as any).connect();
      const result = await client.query('SELECT 1 as test');
      client.release();
      console.log('Database connection test successful');
      return result.rows[0].test === 1;
    }
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}
