import { Router } from 'express';
import { register, login, logout, me } from '../controllers/auth.controller.js';
import { validateBody } from '../middleware/validate.js';
import { registerSchema, loginSchema } from '../validators/schemas.js';
import { requireAuth, csrfGuard } from '../middleware/auth.js';

const router = Router();

// Public — no session yet, so no CSRF token to check.
router.post('/register', validateBody(registerSchema), register);
router.post('/login', validateBody(loginSchema), login);

// Authenticated + state-changing → CSRF-guarded.
router.post('/logout', requireAuth, csrfGuard, logout);

// Authenticated read.
router.get('/me', requireAuth, me);

export default router;
