import mongoose from 'mongoose';
import crypto from 'node:crypto';

const { Schema } = mongoose;

/** Line item with price/name SNAPSHOTS captured at order-creation time. */
const orderItemSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    name: { type: String, required: true }, // snapshot
    price: { type: Number, required: true }, // snapshot, integer paise
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

/** Generate a human-readable internal order id, e.g. QC-7F3A9C2B. */
function generateOrderNumber() {
  return `QC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

const orderSchema = new Schema(
  {
    // Internal, app-owned order identifier (distinct from Razorpay's order id).
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      default: generateOrderNumber,
    },

    // Owner of the order (authenticated user who created it).
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    customer: {
      name: { type: String, required: true, trim: true },
      email: { type: String, required: true, trim: true, lowercase: true },
      phone: { type: String, required: true, trim: true },
    },

    items: {
      type: [orderItemSchema],
      required: true,
      validate: [(v) => Array.isArray(v) && v.length > 0, 'Order must have at least one item'],
    },

    amount: {
      type: Number, // integer paise, computed server-side
      required: true,
      min: 0,
    },
    currency: { type: String, required: true, default: 'INR' },

    // Razorpay references
    razorpayOrderId: { type: String, index: true },
    razorpayPaymentId: { type: String },

    // Lifecycle
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed'],
      default: 'pending',
    },

    // Idempotency guard: set true when stock has been decremented for this order.
    stockDecremented: { type: Boolean, default: false },

    // Guest access: store ONLY the SHA-256 hash of the access token. Never returned.
    accessTokenHash: { type: String, required: true, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.accessTokenHash; // defensive — also select:false above
        return ret;
      },
    },
  }
);

export const Order = mongoose.model('Order', orderSchema);
