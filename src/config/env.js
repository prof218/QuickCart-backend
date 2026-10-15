import dotenv from 'dotenv';

// Load variables from .env once, as early as possible.
dotenv.config();

/**
 * Centralized, typed-ish access to environment variables.
 * Import `config` everywhere instead of reading process.env directly.
 */
export const config = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
  nodeEnv: process.env.NODE_ENV || 'development',

  // Authentication
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  authCookieName: process.env.AUTH_COOKIE_NAME || 'qc_token',
  csrfCookieName: process.env.CSRF_COOKIE_NAME || 'qc_csrf',
  // Secure cookies: default on in production, overridable with COOKIE_SECURE=true/false
  cookieSecure:
    process.env.COOKIE_SECURE != null
      ? process.env.COOKIE_SECURE === 'true'
      : (process.env.NODE_ENV || 'development') === 'production',
};

export const isRazorpayConfigured = () =>
  Boolean(config.razorpayKeyId && config.razorpayKeySecret);

export const isAuthConfigured = () => Boolean(config.jwtSecret);
