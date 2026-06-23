/**
 * Tiny singleton holding the Socket.IO server instance, so non-socket code
 * (REST controllers, jobs) can broadcast without importing the whole socket
 * stack. This file imports nothing app-specific → no circular dependencies.
 */
let _io = null;

export function setIo(io) {
  _io = io;
}

export function getIo() {
  return _io;
}

/** Emit an event to everyone subscribed to a room. No-op before sockets init. */
export function broadcast(roomId, event, payload) {
  if (_io) _io.to(roomId).emit(event, payload);
}
