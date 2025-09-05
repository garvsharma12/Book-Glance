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

  // Apply SQL migrations to embedded DB (best-effort, async without blocking module init)
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
      for (const stmt of statements) {
        await client.query(stmt);
      }
      console.log('✅ Embedded PGlite database initialized with migrations');
    })().catch((err: any) => {
      console.warn('⚠️ Failed to load migrations into embedded DB:', err);
    });
  } catch (err) {
    console.warn('⚠️ No migrations applied to embedded DB:', err);
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
