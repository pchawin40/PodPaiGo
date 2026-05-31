import fs from 'fs';
import pg from 'pg';

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

const env = { ...loadEnv('.env'), ...loadEnv('.env.local') };
const tables = ['parking_lots', 'parking_price_snapshots', 'parkwhiz_quote_snapshots'];

function classify(msg) {
  if (/password authentication failed|no pg_hba|role .* does not exist/i.test(msg)) return 'auth';
  if (/timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH/i.test(msg)) return 'timeout_or_network';
  if (/database .* does not exist/i.test(msg)) return 'database_missing';
  if (/relation .* does not exist/i.test(msg)) return 'schema_missing';
  if (/SSL|certificate/i.test(msg)) return 'ssl';
  return 'other';
}

async function test(label, url) {
  if (!url) {
    console.log(JSON.stringify({ label, status: 'FAIL', errorType: 'missing_env' }));
    return;
  }

  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 8000,
    ssl: url.includes('localhost') || url.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const tablesOut = {};

    for (const t of tables) {
      const reg = await client.query('SELECT to_regclass($1) AS oid', [`public.${t}`]);
      if (reg.rows[0]?.oid) {
        const c = await client.query(`SELECT COUNT(*)::int AS c FROM ${t}`);
        tablesOut[t] = { exists: true, rowCount: c.rows[0].c };
      } else {
        tablesOut[t] = { exists: false };
      }
    }

    await client.end();
    console.log(JSON.stringify({ label, status: 'OK', tables: tablesOut }));
  } catch (e) {
    try {
      await client.end();
    } catch {
      // ignore
    }
    console.log(JSON.stringify({
      label,
      status: 'FAIL',
      errorType: classify(String(e.message)),
      message: String(e.message).split('\n')[0],
    }));
  }
}

console.log('PARKING_DISCOVERY_PROVIDER:', env.PARKING_DISCOVERY_PROVIDER ?? '(unset)');
await test('DATABASE_URL', env.DATABASE_URL);
await test('LOCAL_DATABASE_URL', env.LOCAL_DATABASE_URL);
