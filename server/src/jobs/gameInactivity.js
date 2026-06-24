import { env } from '../config/env.js';

/**
 * Per-game inactivity timers — the instant half of the "delete idle playing
 * rooms" guard. `touchGame` (re)starts the countdown on every game action; if it
 * fires (no move for `gameInactivityMs`), `onTimeout(roomId)` runs. The room
 * sweeper is the restart-safe backstop.
 */
const timers = new Map(); // roomId -> Timeout

export function touchGame(roomId, onTimeout) {
  clearGameTimer(roomId);
  const handle = setTimeout(() => {
    timers.delete(roomId);
    Promise.resolve(onTimeout(roomId)).catch((err) =>
      console.error(`Inactivity cleanup for ${roomId} failed:`, err.message)
    );
  }, env.gameInactivityMs);
  if (typeof handle.unref === 'function') handle.unref();
  timers.set(roomId, handle);
}

export function clearGameTimer(roomId) {
  const handle = timers.get(roomId);
  if (handle) {
    clearTimeout(handle);
    timers.delete(roomId);
  }
}
