import mongoose from 'mongoose';
import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { calcTotalPaise } from '../utils/money.js';
import { generateAccessToken, hashToken } from '../utils/token.js';
import { config } from '../config/env.js';
import { createRazorpayOrder, verifyPaymentSignature } from '../utils/razorpay.js';

/**
 * Resolve requested items against the DB, revalidating existence, price and stock.
 * Never trusts any price/amount from the client. Returns snapshot line items.
 */
async function buildLineItems(requestedItems) {
  // Collapse duplicate productIds into summed quantities.
  const quantityByProduct = new Map();
  for (const { productId, quantity } of requestedItems) {
    if (!mongoose.isValidObjectId(productId)) {
      throw new ApiError(400, `Invalid productId: ${productId}`);
    }
    quantityByProduct.set(productId, (quantityByProduct.get(productId) || 0) + quantity);
  }

  const ids = [...quantityByProduct.keys()];
  const products = await Product.find({ _id: { $in: ids } });
  const productById = new Map(products.map((p) => [String(p._id), p]));

  const lineItems = [];
  for (const [productId, quantity] of quantityByProduct) {
    const product = productById.get(productId);
    if (!product) {
      throw new ApiError(404, `Product not found: ${productId}`);
    }
    if (product.stock <= 0) {
      throw new ApiError(409, `Out of stock: ${product.name}`);
    }
    if (product.stock < quantity) {
      throw new ApiError(
        409,
        `Insufficient stock for ${product.name}: requested ${quantity}, available ${product.stock}`
      );
    }
    lineItems.push({
      product: product._id,
      name: product.name, // price/name snapshots captured here
      price: product.price, // integer paise, from DB (authoritative)
      quantity,
    });
  }
  return lineItems;
}

/**
 * POST /api/payments/create-order
 * Validates products & stock, computes the total server-side (paise),
 * creates a pending order + a Razorpay order, and returns checkout params.
 * Returns the plaintext access token exactly ONCE here.
 */
export const createOrder = asyncHandler(async (req, res) => {
  const { customer, items } = req.body;

  const lineItems = await buildLineItems(items);
  const amount = calcTotalPaise(lineItems); // integer paise, authoritative
  if (amount <= 0) {
    throw new ApiError(400, 'Order total must be greater than zero');
  }

  // Access token: return plaintext once, persist only the hash.
  const accessToken = generateAccessToken();

  // Create our pending order first so we have an internal orderNumber for the receipt.
  const order = await Order.create({
    user: req.user._id, // owner (requireAuth guarantees this)
    customer,
    items: lineItems,
    amount,
    currency: 'INR',
    status: 'pending',
    paymentStatus: 'pending',
    accessTokenHash: hashToken(accessToken),
  });

  let razorpayOrder;
  try {
    razorpayOrder = await createRazorpayOrder({
      amountPaise: amount,
      currency: 'INR',
      receipt: order.orderNumber,
      notes: { orderNumber: order.orderNumber },
    });
  } catch (err) {
    // Roll back the pending order so we don't leave an orphan with no gateway order.
    await Order.deleteOne({ _id: order._id });
    if (err instanceof ApiError) throw err;
    throw new ApiError(502, 'Failed to create payment order with gateway');
  }

  order.razorpayOrderId = razorpayOrder.id;
  await order.save();

  return sendSuccess(res, 201, {
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    accessToken, // shown once — client stores it to view the confirmation
    amount, // paise
    currency: 'INR',
    razorpayOrderId: razorpayOrder.id,
    razorpayKeyId: config.razorpayKeyId, // public key id for Checkout
    customer,
  });
});

/**
 * POST /api/payments/verify
 * Verifies the HMAC signature, confirms the Razorpay order matches the stored
 * order, then atomically marks the order paid and decrements stock exactly once.
 */
export const verifyPayment = asyncHandler(async (req, res) => {
  const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!mongoose.isValidObjectId(orderId)) {
    throw new ApiError(400, 'Invalid orderId');
  }

  const order = await Order.findById(orderId);
  if (!order || String(order.user) !== String(req.user._id)) {
    // Same response for not-found and not-owned (no cross-user enumeration).
    throw new ApiError(404, 'Order not found');
  }

  // Idempotency: if already paid for this same gateway order, succeed without re-processing.
  if (order.paymentStatus === 'paid') {
    if (order.razorpayOrderId !== razorpay_order_id) {
      throw new ApiError(409, 'Order/payment mismatch');
    }
    return sendSuccess(res, 200, {
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      alreadyProcessed: true,
    });
  }

  // The gateway order id in the callback must match the one we stored.
  if (order.razorpayOrderId !== razorpay_order_id) {
    throw new ApiError(400, 'Razorpay order id does not match this order');
  }

  // Verify the signature (constant-time) before changing any state.
  const valid = verifyPaymentSignature({
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });

  if (!valid) {
    // Mark failed only if still pending (don't clobber a concurrent success).
    await Order.updateOne(
      { _id: order._id, paymentStatus: 'pending' },
      { $set: { paymentStatus: 'failed', status: 'failed' } }
    );
    throw new ApiError(400, 'Payment signature verification failed');
  }

  // Atomically claim the transition pending → paid. Only one caller wins,
  // so stock is decremented exactly once even under concurrent/repeated verifies.
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, paymentStatus: 'pending', razorpayOrderId: razorpay_order_id },
    {
      $set: {
        paymentStatus: 'paid',
        status: 'paid',
        razorpayPaymentId: razorpay_payment_id,
        stockDecremented: true,
      },
    },
    { new: true }
  );

  if (!claimed) {
    // Someone else processed it between our read and write — treat as idempotent success.
    const fresh = await Order.findById(orderId);
    return sendSuccess(res, 200, {
      orderId: String(fresh._id),
      orderNumber: fresh.orderNumber,
      status: fresh.status,
      paymentStatus: fresh.paymentStatus,
      alreadyProcessed: true,
    });
  }

  // Decrement stock per line item, guarded so stock never goes negative.
  // (Single-document atomic updates — no multi-doc transaction / replica set required.)
  for (const item of claimed.items) {
    await Product.updateOne(
      { _id: item.product, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity } }
    );
  }

  return sendSuccess(res, 200, {
    orderId: String(claimed._id),
    orderNumber: claimed.orderNumber,
    status: claimed.status,
    paymentStatus: claimed.paymentStatus,
    alreadyProcessed: false,
  });
});

/**
 * POST /api/payments/failed
 * Lets the client record a cancelled/failed checkout (modal dismissed or
 * payment.failed). Only transitions an order that is still pending.
 */
export const markPaymentFailed = asyncHandler(async (req, res) => {
  const { orderId } = req.body;
  if (!mongoose.isValidObjectId(orderId)) {
    throw new ApiError(400, 'Invalid orderId');
  }

  const updated = await Order.findOneAndUpdate(
    { _id: orderId, user: req.user._id, paymentStatus: 'pending' },
    { $set: { paymentStatus: 'failed', status: 'failed' } },
    { new: true }
  );

  if (!updated) {
    // Either not found, not owned, or already resolved (paid/failed).
    const existing = await Order.findOne({ _id: orderId, user: req.user._id });
    if (!existing) throw new ApiError(404, 'Order not found');
    return sendSuccess(res, 200, {
      orderId: String(existing._id),
      status: existing.status,
      paymentStatus: existing.paymentStatus,
    });
  }

  return sendSuccess(res, 200, {
    orderId: String(updated._id),
    status: updated.status,
    paymentStatus: updated.paymentStatus,
  });
});
