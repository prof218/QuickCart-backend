import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyAuthToken, csrfEquals } from '../utils/auth.js';
import { config } from '../config/env.js';

/**
 * Require a valid auth cookie. Loads the user and attaches it to req.user.
 * Responds 401 for missing/invalid/expired tokens or a deleted user.
 */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.[config.authCookieName];
  const payload = verifyAuthToken(token);
  if (!payload?.sub) {
    throw new ApiError(401, 'Authentication required');
  }
  const user = await User.findById(payload.sub);
  if (!user) {
    throw new ApiError(401, 'Session is no longer valid');
  }
  req.user = user;
  next();
});

/**
 * Attach req.user if a valid cookie is present, but never block the request.
 * Useful for endpoints that behave differently for guests vs. members.
 */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.[config.authCookieName];
  const payload = verifyAuthToken(token);
  if (payload?.sub) {
    req.user = await User.findById(payload.sub);
  }
  next();
});

/**
 * Double-submit CSRF guard for state-changing requests: the readable CSRF cookie
 * must match the `x-csrf-token` header. Combined with SameSite=Lax cookies and a
 * strict CORS origin, this protects authenticated mutations.
 */
export function csrfGuard(req, _res, next) {
  const cookieToken = req.cookies?.[config.csrfCookieName];
  const headerToken = req.get('x-csrf-token');
  if (!csrfEquals(cookieToken, headerToken)) {
    return next(new ApiError(403, 'Invalid or missing CSRF token'));
  }
  next();
}
