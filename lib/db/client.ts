import { Pool } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var parkingDbPool: Pool | undefined;
}

function getConnectionString(): string {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }

  return connectionString;
}

export function getDb(): Pool {
  if (global.parkingDbPool) {
    return global.parkingDbPool;
  }

  const pool = new Pool({
    connectionString: getConnectionString(),
    ssl: { rejectUnauthorized: false },

    // Vercel/serverless-safe. Use Supabase Transaction Pooler, usually port 6543.
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });

  global.parkingDbPool = pool;

  return pool;
}

/**
 * Backward-compatible export for existing imports.
 * Prefer getDb() in new server code so DB initialization stays lazy.
 */
export const db = new Proxy({} as Pool, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});