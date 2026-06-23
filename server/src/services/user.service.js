import { query } from '../config/db.js';
import { hashPassword } from './token.service.js';

/** Returns the full row (incl. password_hash) or null. */
export async function findByUsername(username) {
  const { rows } = await query(
    'SELECT id, username, password_hash FROM users WHERE username = $1',
    [username]
  );
  return rows[0] || null;
}

/** Public-safe user (no hash) or null. */
export async function findById(id) {
  const { rows } = await query('SELECT id, username FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

/** Creates a user, returns public-safe row. Caller checks uniqueness first. */
export async function createUser(username, password) {
  const hash = await hashPassword(password);
  const { rows } = await query(
    'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
    [username, hash]
  );
  return rows[0];
}
