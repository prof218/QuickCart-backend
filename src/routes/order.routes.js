import { Router } from 'express';
import { getOrder, listMyOrders } from '../controllers/order.controller.js';
import { validateObjectId } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// All order reads require authentication and are scoped to the owner.
router.get('/', requireAuth, listMyOrders);
router.get('/:id', requireAuth, validateObjectId('id'), getOrder);

export default router;
