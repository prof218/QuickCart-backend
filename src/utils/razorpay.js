import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { config, isRazorpayConfigured } from '../config/env.js';
import { ApiError } from './ApiError.js';

/**
 * Lazily-instantiated Razorpay client. We do NOT create it at import time so
 * the rest of the API (health, products, order lookup) works even when the
 * payment keys are not configured yet.
 */
let client = null;

export function getRazorpayClient() {
  if (!isRazorpayConfigured()) {
    throw new ApiError(
      503,
      'Payment gateway is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.'
    );
  }
  if (!client) {
    client = new Razorpay({
      key_id: config.razorpayKeyId,
      key_secret: config.razorpayKeySecret,
    });
  }
  return client;
}

/**
 * Test seam — NEVER set in production. Lets automated tests stub gateway order
 * creation without calling the live Razorpay API. Production path is unchanged
 * (override stays null unless a test sets it).
 */
let orderCreatorOverride = null;
export function __setRazorpayOrderCreatorForTests(fn) {
  orderCreatorOverride = fn;
}

/**
 * Create a Razorpay order via the official SDK.
 * @param {{ amountPaise:number, currency?:string, receipt:string, notes?:object }} params
 */
export async function createRazorpayOrder({ amountPaise, currency = 'INR', receipt, notes }) {
  if (orderCreatorOverride) {
    return orderCreatorOverride({ amountPaise, currency, receipt, notes });
  }
  const rzp = getRazorpayClient();
  // Official SDK method — https://razorpay.com/docs/api/orders/create/
  return rzp.orders.create({
    amount: amountPaise, // integer paise
    currency,
    receipt,
    notes,
  });
}

/**
 * Verify the Razorpay payment signature.
 *
 * Razorpay signs `${razorpay_order_id}|${razorpay_payment_id}` with HMAC-SHA256
 * using your key secret. We recompute it and compare in constant time.
 *
 * @returns {boolean} true only if the signature is valid.
 */
export function verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature }) {
  if (!isRazorpayConfigured()) {
    throw new ApiError(503, 'Payment gateway is not configured.');
  }
  if (
    typeof razorpayOrderId !== 'string' ||
    typeof razorpayPaymentId !== 'string' ||
    typeof signature !== 'string'
  ) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', config.razorpayKeySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const signatureBuf = Buffer.from(signature, 'utf8');

  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}
