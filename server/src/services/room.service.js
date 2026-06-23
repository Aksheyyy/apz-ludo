import crypto from 'node:crypto';
import { query, withTransaction } from '../config/db.js';
import { conflict, notFound, badRequest } from '../middleware/error.js';
import { scheduleRoomExpiry, cancelRoomExpiry } from '../jobs/roomExpiry.js';
import { broadcast } from '../sockets/io.js';

const COLORS = ['red', 'green', 'yellow', 'blue']; // seat 0..3
const MAX_PLAYERS = 4;
export const ROOM_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Unambiguous alphabet (no 0/O/1/I) for shareable codes.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;

function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LEN; i++) {
    code += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  }
  return code;
}

/** Full room snapshot: room fields + ordered players (with usernames). */
export async function getRoomState(roomId) {
  const room = (
    await query(
      `SELECT id, creator_id, status, max_players, created_at, expires_at,
              started_at, finished_at
         FROM rooms WHERE id = $1`,
      [roomId]
    )
  ).rows[0];
  if (!room) throw notFound('ROOM_NOT_FOUND', 'Room not found.');

  const players = (
    await query(
      `SELECT rp.user_id, u.username, rp.color, rp.seat_order
         FROM room_players rp
         JOIN users u ON u.id = rp.user_id
        WHERE rp.room_id = $1
        ORDER BY rp.seat_order`,
      [roomId]
    )
  ).rows;

  return {
    id: room.id,
    status: room.status,
    creatorId: room.creator_id,
    maxPlayers: room.max_players,
    createdAt: room.created_at,
    expiresAt: room.expires_at,
    startedAt: room.started_at,
    finishedAt: room.finished_at,
    players: players.map((p) => ({
      userId: p.user_id,
      username: p.username,
      color: p.color,
      seat: p.seat_order,
    })),
  };
}

/**
 * Creates a room, auto-seats the creator as red/seat 0, and schedules expiry.
 * Returns { id, expiresAt }.
 */
export async function createRoom(creatorId) {
  const room = await withTransaction(async (client) => {
    // Generate a code, retry on the (extremely unlikely) collision.
    let id = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = generateCode();
      const exists = await client.query('SELECT 1 FROM rooms WHERE id = $1', [candidate]);
      if (exists.rowCount === 0) {
        id = candidate;
        break;
      }
    }
    if (!id) throw conflict('CODE_GENERATION_FAILED', 'Could not allocate a room code. Try again.');

    const inserted = await client.query(
      `INSERT INTO rooms (id, creator_id, status, expires_at)
       VALUES ($1, $2, 'waiting', now() + interval '5 minutes')
       RETURNING expires_at`,
      [id, creatorId]
    );
    await client.query(
      `INSERT INTO room_players (room_id, user_id, color, seat_order)
       VALUES ($1, $2, 'red', 0)`,
      [id, creatorId]
    );
    return { id, expiresAt: inserted.rows[0].expires_at };
  });

  // Happy-path expiry timer: delete if still empty (creator alone) after 5 min.
  scheduleRoomExpiry(room.id, ROOM_TTL_MS, expireIfUnjoined);
  return room;
}

/**
 * Joins a user to a room, assigning the next free color/seat. Concurrency-safe
 * via a row lock on the room. Returns the fresh room state.
 */
export async function joinRoom(roomId, userId) {
  const state = await withTransaction(async (client) => {
    const room = (
      await client.query(
        `SELECT id, status, max_players, expires_at FROM rooms WHERE id = $1 FOR UPDATE`,
        [roomId]
      )
    ).rows[0];
    if (!room) throw notFound('ROOM_NOT_FOUND', 'Room not found.');
    if (room.status === 'expired') throw conflict('ROOM_EXPIRED', 'This room has expired.');
    if (room.status !== 'waiting')
      throw conflict('GAME_ALREADY_STARTED', 'This game has already started.');
    if (new Date(room.expires_at) < new Date())
      throw conflict('ROOM_EXPIRED', 'This room has expired.');

    const seats = (
      await client.query(
        'SELECT user_id, seat_order FROM room_players WHERE room_id = $1 ORDER BY seat_order',
        [roomId]
      )
    ).rows;

    if (seats.some((s) => s.user_id === userId)) {
      throw conflict('ALREADY_JOINED', 'You are already in this room.');
    }
    if (seats.length >= room.max_players) {
      throw conflict('ROOM_FULL', `This room already has ${room.max_players} players.`);
    }

    // Next free seat = lowest index not taken.
    const taken = new Set(seats.map((s) => s.seat_order));
    let seat = 0;
    while (taken.has(seat)) seat++;

    await client.query(
      `INSERT INTO room_players (room_id, user_id, color, seat_order)
       VALUES ($1, $2, $3, $4)`,
      [roomId, userId, COLORS[seat], seat]
    );
    return seats.length + 1; // new player count
  });

  // A real friend joined → the room is no longer "unjoined", cancel auto-expiry.
  if (state >= 2) cancelRoomExpiry(roomId);

  return getRoomState(roomId);
}

/**
 * Leaves a room (pre-game only). Removes the player; deletes the room if it
 * empties; reassigns creator if the creator left. Returns { deleted } or state.
 */
export async function leaveRoom(roomId, userId) {
  return withTransaction(async (client) => {
    const room = (
      await client.query('SELECT id, status, creator_id FROM rooms WHERE id = $1 FOR UPDATE', [
        roomId,
      ])
    ).rows[0];
    if (!room) throw notFound('ROOM_NOT_FOUND', 'Room not found.');
    if (room.status !== 'waiting')
      throw badRequest('GAME_IN_PROGRESS', 'You cannot leave a room once the game has started.');

    const removed = await client.query(
      'DELETE FROM room_players WHERE room_id = $1 AND user_id = $2',
      [roomId, userId]
    );
    if (removed.rowCount === 0) throw badRequest('NOT_IN_ROOM', 'You are not in this room.');

    const remaining = (
      await client.query(
        'SELECT user_id, seat_order FROM room_players WHERE room_id = $1 ORDER BY seat_order',
        [roomId]
      )
    ).rows;

    if (remaining.length === 0) {
      await client.query('DELETE FROM rooms WHERE id = $1', [roomId]);
      cancelRoomExpiry(roomId);
      return { roomId, deleted: true };
    }

    // If the creator left, hand creator role to the lowest remaining seat.
    if (room.creator_id === userId) {
      await client.query('UPDATE rooms SET creator_id = $1 WHERE id = $2', [
        remaining[0].user_id,
        roomId,
      ]);
    }
    return { roomId, deleted: false };
  });
}

/**
 * Deletes a room only if it's still 'waiting' with nobody but the creator.
 * Invoked by the expiry timer and the sweeper. Returns true if deleted.
 */
export async function expireIfUnjoined(roomId) {
  const { rowCount } = await query(
    `DELETE FROM rooms r
      WHERE r.id = $1
        AND r.status = 'waiting'
        AND (SELECT count(*) FROM room_players p WHERE p.room_id = r.id) <= 1`,
    [roomId]
  );
  if (rowCount > 0) {
    broadcast(roomId, 'room:expired', { roomId });
    console.log(`Room ${roomId} expired (unjoined).`);
  }
  return rowCount > 0;
}

/**
 * Transitions a waiting room to 'playing'. Creator-only, needs ≥2 players.
 * Cancels the expiry timer. Returns the fresh room state.
 */
export async function startGame(roomId, userId) {
  await withTransaction(async (client) => {
    const room = (
      await client.query('SELECT id, status, creator_id FROM rooms WHERE id = $1 FOR UPDATE', [
        roomId,
      ])
    ).rows[0];
    if (!room) throw notFound('ROOM_NOT_FOUND', 'Room not found.');
    if (room.status !== 'waiting')
      throw conflict('GAME_ALREADY_STARTED', 'This game has already started.');
    if (room.creator_id !== userId)
      throw conflict('NOT_CREATOR', 'Only the room creator can start the game.');

    const count = (
      await client.query('SELECT count(*)::int AS c FROM room_players WHERE room_id = $1', [roomId])
    ).rows[0].c;
    if (count < 2) throw badRequest('NOT_ENOUGH_PLAYERS', 'Need at least 2 players to start.');

    await client.query("UPDATE rooms SET status = 'playing', started_at = now() WHERE id = $1", [
      roomId,
    ]);
  });

  cancelRoomExpiry(roomId);
  return getRoomState(roomId);
}

/** Marks a room finished when a game ends. */
export async function finishGame(roomId) {
  await query("UPDATE rooms SET status = 'finished', finished_at = now() WHERE id = $1", [roomId]);
}

/** Whether a user is seated in a room. */
export async function isMember(roomId, userId) {
  const { rowCount } = await query(
    'SELECT 1 FROM room_players WHERE room_id = $1 AND user_id = $2',
    [roomId, userId]
  );
  return rowCount > 0;
}

/** Builds the shareable join URL from the client origin. */
export function joinUrl(roomId, clientOrigin) {
  return `${clientOrigin.replace(/\/$/, '')}/join/${roomId}`;
}
