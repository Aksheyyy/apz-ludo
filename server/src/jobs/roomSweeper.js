import { query } from '../config/db.js';
import { env } from '../config/env.js';

/**
 * Restart-safe backstop for the two time-based room guards. Every interval:
 *  1. deletes 'waiting' rooms past expires_at that were never joined, and
 *  2. deletes 'playing' rooms with no move (games.updated_at) for the inactivity
 *     window — covers idle games whose in-memory timer was lost to a restart.
 */
const SWEEP_INTERVAL_MS = 60 * 1000;

async function sweep() {
  try {
    const waiting = await query(
      `DELETE FROM rooms r
        WHERE r.status = 'waiting'
          AND r.expires_at < now()
          AND (SELECT count(*) FROM room_players p WHERE p.room_id = r.id) <= 1`
    );
    if (waiting.rowCount > 0) console.log(`Sweeper expired ${waiting.rowCount} stale room(s).`);

    const idle = await query(
      `DELETE FROM rooms r
        WHERE r.status = 'playing'
          AND r.id IN (
            SELECT g.room_id FROM games g
             WHERE g.updated_at < now() - (interval '1 millisecond' * $1)
          )`,
      [env.gameInactivityMs]
    );
    if (idle.rowCount > 0) console.log(`Sweeper deleted ${idle.rowCount} idle game(s).`);
  } catch (err) {
    console.error('Room sweeper error:', err.message);
  }
}

export function startRoomSweeper() {
  const handle = setInterval(sweep, SWEEP_INTERVAL_MS);
  if (typeof handle.unref === 'function') handle.unref();
  return handle;
}
