import { verifyToken } from '../services/token.service.js';

/**
 * Socket.IO connection middleware. Verifies the JWT from the handshake once;
 * the resulting user is trusted for all subsequent events on this socket.
 * Client connects with:  io(url, { auth: { token } })
 */
export function socketAuth(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('UNAUTHORIZED'));
  try {
    socket.data.user = verifyToken(token); // { id, username }
    next();
  } catch {
    next(new Error('UNAUTHORIZED'));
  }
}
