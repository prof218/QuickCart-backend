/**
 * Money helpers.
 *
 * All prices and amounts are stored and calculated as **integer paise**
 * (1 INR = 100 paise) to avoid floating-point rounding errors.
 * Razorpay also expects amounts in paise, so there is no conversion at the gateway boundary.
 */

/** Convert rupees (number) to integer paise. Used only by the seed script. */
export const rupeesToPaise = (rupees) => Math.round(rupees * 100);

/** Format integer paise as a human-readable INR string (for logs/receipts). */
export const paiseToInrString = (paise) =>
  `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

/**
 * Sum line items in paise. Each item: { price (paise), quantity }.
 * Returns an integer number of paise.
 */
export const calcTotalPaise = (items) =>
  items.reduce((sum, item) => sum + item.price * item.quantity, 0);
