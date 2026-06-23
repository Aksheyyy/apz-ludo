import { query } from '../config/db.js';

/**
 * Restart-safe backstop for room expiry. Every interval, deletes 'waiting' rooms
 * that are past expires_at and were never joined (creator alone). Covers rooms
 * whose in-memory timer was lost to a server restart.
 */
const SWEEP_INTERVAL_MS = 60 * 1000;

async function sweep() {
  try {
    const { rowCount } = await query(
      `DELETE FROM rooms r
        WHERE r.status = 'waiting'
          AND r.expires_at < now()
          AND (SELECT count(*) FROM room_players p WHERE p.room_id = r.id) <= 1`
    );
    if (rowCount > 0) console.log(`Sweeper expired ${rowCount} stale room(s).`);
  } catch (err) {
    console.error('Room sweeper error:', err.message);
  }
}

export function startRoomSweeper() {
  const handle = setInterval(sweep, SWEEP_INTERVAL_MS);
  if (typeof handle.unref === 'function') handle.unref();
  return handle;
}
