/**
 * In-memory per-room expiry timers — the instant, happy-path half of room
 * expiration. The roomSweeper job is the restart-safe backstop.
 *
 * A timer fires `onExpire(roomId)` after `delayMs`. Cancel it when the room is
 * no longer eligible to expire (a 2nd player joined, or the game started).
 */
const timers = new Map(); // roomId -> Timeout

export function scheduleRoomExpiry(roomId, delayMs, onExpire) {
  cancelRoomExpiry(roomId);
  const handle = setTimeout(() => {
    timers.delete(roomId);
    Promise.resolve(onExpire(roomId)).catch((err) =>
      console.error(`Room expiry for ${roomId} failed:`, err.message)
    );
  }, delayMs);
  // Don't keep the process alive just for a pending expiry timer.
  if (typeof handle.unref === 'function') handle.unref();
  timers.set(roomId, handle);
}

export function cancelRoomExpiry(roomId) {
  const handle = timers.get(roomId);
  if (handle) {
    clearTimeout(handle);
    timers.delete(roomId);
  }
}
