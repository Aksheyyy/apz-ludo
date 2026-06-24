import { io } from 'socket.io-client';

let socket = null;

/** Create (or reuse) the singleton socket, authenticated with the JWT. */
export function connectSocket(token) {
  if (socket && socket.connected) return socket;
  if (socket) socket.disconnect();
  socket = io(import.meta.env.VITE_SOCKET_URL, {
    auth: { token },
    transports: ['websocket'],
    autoConnect: true,
  });
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
