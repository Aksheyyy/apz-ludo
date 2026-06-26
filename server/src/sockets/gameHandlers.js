import * as rooms from '../services/room.service.js';
import * as GameManager from '../game/GameManager.js';
import * as Engine from '../game/LudoEngine.js';
import { broadcast } from './io.js';
import { touchGame, clearGameTimer } from '../jobs/gameInactivity.js';

function emitError(socket, err) {
  socket.emit('error', {
    code: err.code || 'ERROR',
    message: err.message || 'Something went wrong.',
  });
}

/** Restart the inactivity countdown for a live game (called on every action). */
function bumpActivity(roomId) {
  touchGame(roomId, abandonIdleGame);
}

/** No move for the inactivity window → close and delete the playing room. */
async function abandonIdleGame(roomId) {
  const game = GameManager.getGame(roomId);
  if (!game || game.phase === 'finished') return;
  GameManager.removeGame(roomId);
  clearGameTimer(roomId);
  broadcast(roomId, 'game:abandoned', { roomId, reason: 'inactivity' });
  await rooms.deleteRoom(roomId);
  console.log(`Room ${roomId} deleted (inactive).`);
}

/** Returns the seat if it's this user's turn, else null. */
function currentSeatFor(game, userId) {
  const p = game.players.find((pl) => pl.seat === game.currentSeat);
  return p && p.userId === userId ? p.seat : null;
}

/** Advance to the next player and reset for their roll. */
function advanceTurn(game) {
  game.lastDice = null;
  game.consecutiveSixes = 0;
  game.currentSeat = Engine.nextSeat(game);
  game.phase = 'rolling';
}

/**
 * Handle a player leaving a room — works for both the waiting room and an
 * in-progress game.
 *  - Waiting room (no live game): remove from DB, reassign host, broadcast.
 *  - Active game: mark the player as left. If only one player remains, they win.
 *    Otherwise continue, advancing the turn if it was the leaver's.
 */
async function leaveRoomOrGame(io, roomId, userId) {
  const game = GameManager.getGame(roomId);

  if (!game) {
    // Not started yet → ordinary waiting-room leave.
    try {
      const result = await rooms.leaveRoom(roomId, userId);
      if (result.deleted) broadcast(roomId, 'room:closed', { roomId });
      else broadcast(roomId, 'room:state', await rooms.getRoomState(roomId));
    } catch {
      /* already left / game started in a race — ignore */
    }
    return;
  }

  const player = game.players.find((p) => p.userId === userId);
  if (!player || player.left || game.phase === 'finished') return;

  player.left = true;
  game.version += 1;
  broadcast(roomId, 'player:left', { seat: player.seat, color: player.color });

  const remaining = game.players.filter((p) => !p.left);
  if (remaining.length === 1) {
    const w = remaining[0];
    game.phase = 'finished';
    game.winnerSeat = w.seat;
    clearGameTimer(roomId);
    await rooms.finishGame(roomId);
    await GameManager.snapshot(roomId, w.userId);
    broadcast(roomId, 'game:state', { state: game });
    broadcast(roomId, 'game:over', {
      winnerSeat: w.seat,
      winnerUserId: w.userId,
      reason: 'last-player',
    });
    return;
  }

  // 2+ players remain: if it was the leaver's turn, hand it on.
  if (game.currentSeat === player.seat) advanceTurn(game);
  broadcast(roomId, 'game:state', { state: game });
  if (game.currentSeat !== player.seat) {
    broadcast(roomId, 'turn:changed', { currentSeat: game.currentSeat });
  }
  await GameManager.snapshot(roomId);
}

// How long to wait after a disconnect before treating it as "left" — lets a
// page refresh reconnect without ending the game.
const DISCONNECT_GRACE_MS = 8000;

/** Registers all gameplay events for a single connected socket. */
export function registerGameHandlers(io, socket) {
  const user = socket.data.user;
  socket.data.rooms = socket.data.rooms || new Set();

  // Subscribe this socket to a room and send the current snapshot to the caller.
  socket.on('room:join', async ({ roomId } = {}) => {
    try {
      const state = await rooms.getRoomState(roomId); // throws ROOM_NOT_FOUND
      if (!state.players.some((p) => p.userId === user.id)) {
        return emitError(socket, { code: 'NOT_IN_ROOM', message: 'Join the room first.' });
      }
      socket.join(roomId);
      socket.data.rooms.add(roomId);
      socket.emit('room:state', state);
      // If a game is already running, hand the late/reconnecting socket the board.
      const game = GameManager.getGame(roomId);
      if (game) {
        socket.emit('game:state', { state: game });
        // If the reconnecting player was mid-move (their turn, phase='moving'), re-send
        // the available moves — the client clears availableMoves on every game:state, so
        // without this the player would be stuck with an empty move set after a refresh.
        if (game.phase === 'moving') {
          const cp = game.players.find((pl) => pl.seat === game.currentSeat);
          if (cp && cp.userId === user.id) {
            const moves = Engine.legalMoves(game, game.currentSeat, game.lastDice);
            socket.emit('moves:available', { seat: game.currentSeat, tokenIndexes: moves });
          }
        }
      }
    } catch (err) {
      emitError(socket, err);
    }
  });

  socket.on('room:leave', ({ roomId } = {}) => {
    if (roomId) {
      socket.leave(roomId);
      socket.data.rooms.delete(roomId);
    }
  });

  // Explicit "Leave game" — declares a winner if only one player remains.
  socket.on('game:leave', async ({ roomId } = {}) => {
    if (!roomId) return;
    socket.leave(roomId);
    socket.data.rooms.delete(roomId);
    await leaveRoomOrGame(io, roomId, user.id);
  });

  // Creator starts the game.
  socket.on('game:start', async ({ roomId } = {}) => {
    try {
      const state = await rooms.startGame(roomId, user.id); // validates creator + ≥2
      const game = await GameManager.createGame(roomId, state.players);
      broadcast(roomId, 'room:state', state);
      broadcast(roomId, 'game:started', { state: game });
      bumpActivity(roomId); // begin the idle countdown
    } catch (err) {
      emitError(socket, err);
    }
  });

  // Roll the dice — server generates the value. Anti-cheat: turn + phase checked.
  socket.on('dice:roll', async ({ roomId } = {}) => {
    try {
      const game = GameManager.getGame(roomId);
      if (!game || game.phase === 'finished')
        return emitError(socket, { code: 'NO_GAME', message: 'No active game.' });
      const seat = currentSeatFor(game, user.id);
      if (seat === null)
        return emitError(socket, { code: 'NOT_YOUR_TURN', message: 'It is not your turn.' });
      if (game.phase !== 'rolling')
        return emitError(socket, { code: 'BAD_PHASE', message: 'You have already rolled.' });

      bumpActivity(roomId); // a roll counts as activity
      const dice = Engine.rollDice();
      game.lastDice = dice;
      game.consecutiveSixes = dice === 6 ? game.consecutiveSixes + 1 : 0;
      broadcast(roomId, 'dice:rolled', { seat, value: dice });

      // Three 6s in a row → forfeit the turn.
      if (game.consecutiveSixes === 3) {
        advanceTurn(game);
        broadcast(roomId, 'turn:changed', { currentSeat: game.currentSeat });
        return GameManager.snapshot(roomId);
      }

      const moves = Engine.legalMoves(game, seat, dice);
      if (moves.length === 0) {
        advanceTurn(game); // nothing playable → next player
        broadcast(roomId, 'turn:changed', { currentSeat: game.currentSeat });
        return GameManager.snapshot(roomId);
      }

      game.phase = 'moving';
      socket.emit('moves:available', { seat, tokenIndexes: moves }); // roller only
      await GameManager.snapshot(roomId);
    } catch (err) {
      emitError(socket, err);
    }
  });

  // Move a token — validated against the server's legal-move set.
  socket.on('token:move', async ({ roomId, tokenIndex } = {}) => {
    try {
      const game = GameManager.getGame(roomId);
      if (!game || game.phase === 'finished')
        return emitError(socket, { code: 'NO_GAME', message: 'No active game.' });
      const seat = currentSeatFor(game, user.id);
      if (seat === null)
        return emitError(socket, { code: 'NOT_YOUR_TURN', message: 'It is not your turn.' });
      if (game.phase !== 'moving')
        return emitError(socket, { code: 'BAD_PHASE', message: 'Roll the dice first.' });

      const dice = game.lastDice;
      const moves = Engine.legalMoves(game, seat, dice);
      if (!moves.includes(tokenIndex))
        return emitError(socket, { code: 'INVALID_MOVE', message: 'That move is not allowed.' });

      bumpActivity(roomId); // a move counts as activity
      const result = Engine.applyMove(game, seat, tokenIndex, dice);

      let turnAdvanced = false;
      let winnerUserId = null;
      if (result.won !== null) {
        game.phase = 'finished';
        game.winnerSeat = seat;
        game.lastDice = null;
        winnerUserId = game.players.find((p) => p.seat === seat).userId;
      } else if (result.extraTurn) {
        game.phase = 'rolling';
        game.lastDice = null;
        if (dice !== 6) game.consecutiveSixes = 0;
      } else {
        advanceTurn(game);
        turnAdvanced = true;
      }

      broadcast(roomId, 'game:state', { state: game });
      for (const c of result.captured) {
        broadcast(roomId, 'token:captured', {
          bySeat: seat,
          victimSeat: c.seat,
          tokenIndex: c.tokenIndex,
        });
      }

      if (result.won !== null) {
        clearGameTimer(roomId);
        await rooms.finishGame(roomId);
        await GameManager.snapshot(roomId, winnerUserId);
        broadcast(roomId, 'game:over', { winnerSeat: seat, winnerUserId });
        return;
      }
      if (turnAdvanced) broadcast(roomId, 'turn:changed', { currentSeat: game.currentSeat });
      await GameManager.snapshot(roomId);
    } catch (err) {
      emitError(socket, err);
    }
  });

  socket.on('disconnect', () => {
    const roomIds = [...socket.data.rooms];
    for (const roomId of roomIds) {
      setTimeout(async () => {
        // If the same user reconnected (refresh, another tab), don't treat as left.
        const sockets = await io.in(roomId).fetchSockets();
        const stillConnected = sockets.some((s) => s.data.user?.id === user.id);
        if (!stillConnected) await leaveRoomOrGame(io, roomId, user.id);
      }, DISCONNECT_GRACE_MS);
    }
  });
}
