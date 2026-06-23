import crypto from 'node:crypto';
import * as B from './board.js';

/**
 * Pure Ludo rules. No I/O, no sockets — easy to unit-test in isolation.
 * `legalMoves` is read-only; `applyMove` mutates the passed-in state (which is
 * the live in-memory game) and returns metadata about what happened.
 */

/** Server-authoritative dice. Cryptographically random 1..6. */
export function rollDice() {
  return crypto.randomInt(1, 7);
}

const playerAt = (state, seat) => state.players.find((p) => p.seat === seat);

/**
 * Token indexes (0..3) the given player may legally move with `dice`.
 *  - From base: only with a 6.
 *  - On track / home column: only if it doesn't overshoot the center.
 */
export function legalMoves(state, seat, dice) {
  const player = playerAt(state, seat);
  const moves = [];
  player.tokens.forEach((pos, i) => {
    if (pos === B.FINISHED) return;
    if (pos === B.HOME_BASE) {
      if (dice === 6) moves.push(i);
      return;
    }
    const progress = B.toProgress(player.color, pos);
    if (progress + dice <= B.CENTER_PROGRESS) moves.push(i);
  });
  return moves;
}

/**
 * Applies a (pre-validated) move in place. Returns:
 *   { to, captured:[{seat,tokenIndex}], finishedToken, won:seat|null, extraTurn }
 * Caller must ensure tokenIndex ∈ legalMoves(state, seat, dice).
 */
export function applyMove(state, seat, tokenIndex, dice) {
  const player = playerAt(state, seat);
  const pos = player.tokens[tokenIndex];

  let to;
  if (pos === B.HOME_BASE) {
    to = B.START_OFFSET[player.color]; // leaves base onto its start cell
  } else {
    const progress = B.toProgress(player.color, pos);
    to = B.fromProgress(player.color, progress + dice);
  }
  player.tokens[tokenIndex] = to;

  let finishedToken = false;
  if (to === B.FINISHED) {
    player.finished += 1;
    finishedToken = true;
  }

  // Capture: any opponent token on the landing cell (if not a safe cell) goes home.
  const captured = [];
  if (B.isMainCell(to) && !B.SAFE_CELLS.has(to)) {
    for (const opp of state.players) {
      if (opp.seat === seat) continue;
      opp.tokens.forEach((opos, oi) => {
        if (opos === to) {
          opp.tokens[oi] = B.HOME_BASE;
          captured.push({ seat: opp.seat, tokenIndex: oi });
        }
      });
    }
  }

  const won = player.finished === 4 ? seat : null;
  // Bonus turn for a 6, a capture, or getting a token home — standard Ludo.
  const extraTurn = dice === 6 || captured.length > 0 || finishedToken;

  state.version += 1; // bump on every applied move (change signal for clients)
  return { to, captured, finishedToken, won, extraTurn };
}

/** Next seat to act, skipping players who finished all 4 tokens or left the game. */
export function nextSeat(state) {
  const seats = state.players.map((p) => p.seat).sort((a, b) => a - b);
  const idx = seats.indexOf(state.currentSeat);
  for (let k = 1; k <= seats.length; k++) {
    const cand = seats[(idx + k) % seats.length];
    const p = playerAt(state, cand);
    if (p.finished < 4 && !p.left) return cand;
  }
  return state.currentSeat;
}
