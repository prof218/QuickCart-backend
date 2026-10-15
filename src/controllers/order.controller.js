import { Order } from '../models/Order.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

/**
 * GET /api/orders/:id
 * Returns an order only to its authenticated owner. A non-existent id and an
 * order owned by someone else both return 404 (no cross-user enumeration).
 */
export const getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
  if (!order) {
    throw new ApiError(404, 'Order not found');
  }
  return sendSuccess(res, 200, { order: order.toJSON() });
});

/**
 * GET /api/orders
 * Lists the authenticated user's orders (most recent first).
 */
export const listMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
  return sendSuccess(res, 200, { orders, count: orders.length });
});
