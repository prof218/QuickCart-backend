import { z } from 'zod';

/** A reasonably strict phone check: 7–15 digits, optional leading +. */
const phoneRegex = /^\+?[0-9]{7,15}$/;

export const customerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().trim().toLowerCase().email('A valid email is required').max(200),
  phone: z
    .string()
    .trim()
    .regex(phoneRegex, 'Phone must be 7–15 digits, optional leading +'),
});

export const createOrderSchema = z.object({
  customer: customerSchema,
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1, 'productId is required'),
        quantity: z.number().int('Quantity must be an integer').min(1).max(100),
      })
    )
    .min(1, 'At least one item is required')
    .max(50),
});

export const verifyPaymentSchema = z.object({
  orderId: z.string().trim().min(1, 'orderId is required'),
  razorpay_order_id: z.string().trim().min(1, 'razorpay_order_id is required'),
  razorpay_payment_id: z.string().trim().min(1, 'razorpay_payment_id is required'),
  razorpay_signature: z.string().trim().min(1, 'razorpay_signature is required'),
});

export const markFailedSchema = z.object({
  orderId: z.string().trim().min(1, 'orderId is required'),
  reason: z.string().trim().max(500).optional(),
});

// ---- Authentication ----

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Full name is required').max(100),
  email: z.string().trim().toLowerCase().email('A valid email is required').max(200),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('A valid email is required').max(200),
  password: z.string().min(1, 'Password is required').max(128),
});
