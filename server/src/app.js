import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { ping } from './config/db.js';
import { errorHandler } from './middleware/error.js';
import authRoutes from './routes/auth.routes.js';
import roomRoutes from './routes/room.routes.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json());

  // Liveness: is the process up?
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  // Readiness: can we actually reach Supabase?
  app.get('/health/db', async (_req, res) => {
    try {
      const now = await ping();
      res.json({ status: 'ok', db: 'connected', serverTime: now });
    } catch (err) {
      res.status(503).json({ status: 'error', db: 'unreachable', message: err.message });
    }
  });

  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/rooms', roomRoutes);

  // Central error handler — must be last.
  app.use(errorHandler);

  return app;
}
