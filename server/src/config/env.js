import 'dotenv/config';

/**
 * Reads and validates environment variables once at startup.
 * Fails fast with a clear message if something required is missing.
 */
function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`✗ Missing required env var: ${name}`);
    console.error('  Copy .env.example to .env and fill it in.');
    process.exit(1);
  }
  return value;
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  port: Number(process.env.PORT) || 3000,
  isProd: process.env.NODE_ENV === 'production',
  // Delete a playing room if no move is made for this long (default 2 min).
  gameInactivityMs: Number(process.env.GAME_INACTIVITY_MS) || 2 * 60 * 1000,
};
