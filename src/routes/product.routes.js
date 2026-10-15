import { Router } from 'express';
import { listProducts, getProduct } from '../controllers/product.controller.js';
import { validateObjectId } from '../middleware/validate.js';

const router = Router();

router.get('/', listProducts);
router.get('/:id', validateObjectId('id'), getProduct);

export default router;
