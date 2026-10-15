import { Product } from '../models/Product.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

/**
 * GET /api/products
 * Optional query: ?category=Audio
 */
export const listProducts = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.category) {
    filter.category = String(req.query.category);
  }

  const products = await Product.find(filter).sort({ createdAt: -1 });
  return sendSuccess(res, 200, { products, count: products.length });
});

/**
 * GET /api/products/:id
 */
export const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    throw new ApiError(404, 'Product not found');
  }
  return sendSuccess(res, 200, { product });
});
