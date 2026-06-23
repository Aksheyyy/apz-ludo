import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

// Parse BIGINT (OID 20) as a JS number. Safe here — IDs for a 4-player hobby app
// never approach Number.MAX_SAFE_INTEGER. Keeps id types consistent (number, not
// string) across DB rows and JWT payloads.
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

/**
 * Single shared connection pool for the whole app.
 * Supabase requires SSL; its cert chain isn't in Node's default store, so we
 * disable strict verification (standard for Supabase/Render managed Postgres).
 */
export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: 10, // plenty for a 4-player hobby app
});

pool.on('error', (err) => {
  // A backend client may be terminated by Supabase when idle — log, don't crash.
  console.error('Unexpected idle Postgres client error:', err.message);
});

/** Convenience query helper. */
export const query = (text, params) => pool.query(text, params);

/** Verifies connectivity; returns the DB server time. Throws on failure. */
export async function ping() {
  const { rows } = await pool.query('SELECT now() AS now');
  return rows[0].now;
}

/**
 * Runs `fn(client)` inside a transaction. Commits on success, rolls back on
 * throw, always releases the client. Use for multi-statement atomic operations.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
