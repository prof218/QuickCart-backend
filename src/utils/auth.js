import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { ApiError } from './ApiError.js';

/** Sign a JWT carrying the user id (subject). */
export function signAuthToken(userId) {
  if (!config.jwtSecret) {
    throw new ApiError(503, 'Authentication is not configured (missing JWT_SECRET).');
  }
  return jwt.sign({ sub: String(userId) }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

/** Verify a JWT, returning the payload, or null if invalid/expired. */
export function verifyAuthToken(token) {
  if (!config.jwtSecret || !token) return null;
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

/** Generate a random CSRF token (double-submit cookie pattern). */
export function generateCsrfToken() {
  return crypto.randomBytes(24).toString('hex');
}

/** Constant-time comparison of two CSRF token strings. */
export function csrfEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Options for the auth (HttpOnly) cookie. */
export function authCookieOptions(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs,
  };
}

/** Options for the CSRF cookie — readable by JS so the client can echo it in a header. */
export function csrfCookieOptions(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  return {
    httpOnly: false,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs,
  };
}
