import { query } from '../config/db.js';

/**
 * Persistence for the `games` table. The authoritative game state lives in
 * memory (GameManager); these snapshots exist for crash recovery only.
 * JSONB params are explicitly stringified for node-postgres.
 */

export async function createGameRow(roomId, state, currentTurn = 0) {
  await query(
    `INSERT INTO games (room_id, state, current_turn)
     VALUES ($1, $2, $3)
     ON CONFLICT (room_id)
       DO UPDATE SET state = EXCLUDED.state,
                     current_turn = EXCLUDED.current_turn,
                     winner_id = NULL,
                     updated_at = now()`,
    [roomId, JSON.stringify(state), currentTurn]
  );
}

export async function saveSnapshot(roomId, state, currentTurn, winnerId = null) {
  await query(
    `UPDATE games
        SET state = $2, current_turn = $3, winner_id = $4, updated_at = now()
      WHERE room_id = $1`,
    [roomId, JSON.stringify(state), currentTurn, winnerId]
  );
}

export async function loadSnapshot(roomId) {
  const { rows } = await query('SELECT state, current_turn FROM games WHERE room_id = $1', [roomId]);
  return rows[0] || null;
}
