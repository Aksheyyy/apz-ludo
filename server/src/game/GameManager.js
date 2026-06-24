import * as gameService from '../services/game.service.js';

/**
 * In-memory registry of live games — authoritative source of truth during play.
 * Map<roomId, state>. A handful of concurrent games at most, so a plain Map is
 * all we need. Each mutation is mirrored to Postgres for crash recovery.
 *
 * The Ludo *rules* (dice, legal moves, captures, win) arrive in Phase 5 via
 * LudoEngine; this module owns the lifecycle and persistence.
 */
const games = new Map();

/** Build the starting board state from an ordered list of room players. */
export function buildInitialState(players) {
  const ordered = [...players].sort((a, b) => a.seat - b.seat);
  return {
    phase: 'rolling', // 'rolling' | 'moving' | 'finished'
    currentSeat: ordered[0].seat,
    lastDice: null,
    consecutiveSixes: 0,
    players: ordered.map((p) => ({
      seat: p.seat,
      userId: p.userId,
      color: p.color,
      tokens: [-1, -1, -1, -1], // -1 = base
      finished: 0,
      left: false, // set true if the player leaves/disconnects mid-game
    })),
    winnerSeat: null,
    version: 0,
  };
}

export async function createGame(roomId, players) {
  const state = buildInitialState(players);
  games.set(roomId, state);
  await gameService.createGameRow(roomId, state, state.currentSeat);
  return state;
}

export function getGame(roomId) {
  return games.get(roomId) || null;
}

export function hasGame(roomId) {
  return games.has(roomId);
}

export function removeGame(roomId) {
  games.delete(roomId);
}

/** Persist the current in-memory state for a room (throttle at call sites). */
export async function snapshot(roomId, winnerId = null) {
  const state = games.get(roomId);
  if (!state) return;
  await gameService.saveSnapshot(roomId, state, state.currentSeat, winnerId);
}
