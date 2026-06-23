/**
 * Standalone connectivity check: `npm run db:ping`
 * Confirms DATABASE_URL works without starting the whole server.
 */
import { ping, pool } from '../config/db.js';

try {
  const now = await ping();
  console.log(`✓ Connected to Supabase Postgres. Server time: ${now}`);
  process.exit(0);
} catch (err) {
  console.error('✗ Connection failed:', err.message);
  console.error('  Tip: use the Session Pooler URL (port 5432, *.pooler.supabase.com).');
  process.exit(1);
} finally {
  await pool.end().catch(() => {});
}
