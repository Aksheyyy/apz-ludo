import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { setIo } from './io.js';
import { socketAuth } from './socketAuth.js';
import { registerGameHandlers } from './gameHandlers.js';

/** Attaches Socket.IO to the HTTP server with JWT-authenticated connections. */
export function initSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.clientOrigin },
  });
  setIo(io);

  io.use(socketAuth);

  io.on('connection', (socket) => {
    const { username } = socket.data.user;
    console.log(`↔ socket connected: ${username} (${socket.id})`);
    registerGameHandlers(io, socket);
    socket.on('disconnect', (reason) =>
      console.log(`✕ socket disconnected: ${username} (${reason})`)
    );
  });

  return io;
}
