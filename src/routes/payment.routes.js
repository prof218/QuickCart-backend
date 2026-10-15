import { Router } from 'express';
import {
  createOrder,
  verifyPayment,
  markPaymentFailed,
} from '../controllers/payment.controller.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth, csrfGuard } from '../middleware/auth.js';
import {
  createOrderSchema,
  verifyPaymentSchema,
  markFailedSchema,
} from '../validators/schemas.js';

const router = Router();

// All payment actions require an authenticated user (purchase actions) and a CSRF token.
router.post('/create-order', requireAuth, csrfGuard, validateBody(createOrderSchema), createOrder);
router.post('/verify', requireAuth, csrfGuard, validateBody(verifyPaymentSchema), verifyPayment);
router.post('/failed', requireAuth, csrfGuard, validateBody(markFailedSchema), markPaymentFailed);

export default router;
