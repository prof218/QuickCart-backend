import { createApp } from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { config } from './config/env.js';

async function start() {
  try {
    await connectDB();
    console.log('[db] connected to MongoDB');
  } catch (err) {
    console.error('[db] connection failed:', err.message);
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`[server] QuickCart API listening on http://localhost:${config.port}`);
    console.log(`[server] CORS allowed origin: ${config.frontendUrl}`);
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`\n[server] ${signal} received, shutting down...`);
    server.close(async () => {
      await disconnectDB();
      console.log('[server] closed. Bye.');
      process.exit(0);
    });
    // Force-exit if close hangs
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
