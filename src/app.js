import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import apiRoutes from './routes/index.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  // Trust proxy (useful behind hosting load balancers for correct protocol/ip).
  app.set('trust proxy', 1);

  // CORS: allow the configured frontend origin (and same-origin / tools with no Origin).
  // credentials:true so the browser sends/receives the auth + CSRF cookies.
  const allowedOrigins = new Set([config.frontendUrl]);
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'x-access-token', 'x-csrf-token'],
      credentials: true,
    })
  );

  // Body + cookie parsing.
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // API routes under /api
  app.use('/api', apiRoutes);

  // Root ping
  app.get('/', (_req, res) => {
    res.json({ success: true, data: { name: 'QuickCart API', docs: '/api/health' } });
  });

  // 404 + centralized error handling (must be last)
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;
