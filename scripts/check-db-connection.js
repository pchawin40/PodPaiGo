/* eslint-disable @typescript-eslint/no-require-imports */
const { loadEnvConfig } = require('@next/env');
const pg = require('pg');
const {
  resolveDatabaseUrl,
  isPlaceholderUrl,
  sanitizeConnectionString,
  sslConfig,
} = require('../lib/db/checkDbUtils');

loadEnvConfig(process.cwd());

async function main() {
  const databaseUrl = resolveDatabaseUrl();

  if (!databaseUrl) {
    console.error('DB FAIL: DATABASE_URL and LOCAL_DATABASE_URL are missing or empty.');
    console.error('Set DATABASE_URL in .env.local (see .env.example).');
    process.exit(1);
  }

  if (isPlaceholderUrl(databaseUrl)) {
    console.error('DB FAIL: DATABASE_URL still contains placeholder values.');
    console.error(`Connection: ${sanitizeConnectionString(databaseUrl)}`);
    console.error('Replace <PROJECT_REF> and <PASSWORD> with your Supabase project values.');
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 1,
    ssl: sslConfig(databaseUrl),
    connectionTimeoutMillis: 8_000,
  });

  try {
    const result = await pool.query(
      'select now() as now, current_database() as db, current_user as user',
    );
    const row = result.rows[0];

    console.log(
      `DB OK: ${row.db}/${row.user}/${new Date(row.now).toISOString()} (${sanitizeConnectionString(databaseUrl)})`,
    );
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('DB FAIL:', message.split('\n')[0]);
    console.error(`Connection: ${sanitizeConnectionString(databaseUrl)}`);
    console.error('Check credentials, Supabase pooler host/port, and network access.');
    process.exit(1);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

main();
