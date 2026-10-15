import { Router } from 'express';
import { dbState } from '../config/db.js';
import { isRazorpayConfigured, isAuthConfigured } from '../config/env.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

// GET /api/health
router.get('/', (_req, res) => {
  sendSuccess(res, 200, {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    db: dbState(),
    razorpayConfigured: isRazorpayConfigured(),
    authConfigured: isAuthConfigured(),
  });
});

export default router;
