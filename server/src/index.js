import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { ping } from './config/db.js';
import { startRoomSweeper } from './jobs/roomSweeper.js';
import { initSockets } from './sockets/index.js';

const app = createApp();
const server = http.createServer(app);

initSockets(server);

server.listen(env.port, async () => {
  console.log(`▶ APZ Ludo server listening on http://localhost:${env.port}`);
  try {
    const now = await ping();
    console.log(`✓ Supabase Postgres connected (server time: ${now})`);
  } catch (err) {
    console.error('✗ Could not reach Supabase Postgres:', err.message);
    console.error('  Check DATABASE_URL (use the Session Pooler URL) and SSL settings.');
  }
  startRoomSweeper();
  console.log('✓ Room sweeper running (every 60s)');
  console.log('✓ Socket.IO ready');
});

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n${sig} received, shutting down…`);
    server.close(() => process.exit(0));
  });
}
