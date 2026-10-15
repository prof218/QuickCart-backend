import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { config } from '../config/env.js';
import {
  signAuthToken,
  generateCsrfToken,
  authCookieOptions,
  csrfCookieOptions,
} from '../utils/auth.js';

/** Set the HttpOnly auth cookie + readable CSRF cookie for a logged-in user. */
function issueSession(res, userId) {
  const token = signAuthToken(userId);
  const csrf = generateCsrfToken();
  res.cookie(config.authCookieName, token, authCookieOptions());
  res.cookie(config.csrfCookieName, csrf, csrfCookieOptions());
}

/** Clear both auth cookies. */
function clearSession(res) {
  res.clearCookie(config.authCookieName, { ...authCookieOptions(), maxAge: undefined });
  res.clearCookie(config.csrfCookieName, { ...csrfCookieOptions(), maxAge: undefined });
}

/**
 * POST /api/auth/register
 * Creates a user with a hashed password, then logs them in.
 */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  // Duplicate email → 409 (registration intentionally reveals this so the user
  // can switch to login; login itself stays non-enumerating).
  const existing = await User.findOne({ email });
  if (existing) {
    throw new ApiError(409, 'An account with this email already exists');
  }

  const user = new User({ name, email });
  await user.setPassword(password);
  try {
    await user.save();
  } catch (err) {
    if (err?.code === 11000) {
      throw new ApiError(409, 'An account with this email already exists');
    }
    throw err;
  }

  issueSession(res, user._id);
  return sendSuccess(res, 201, { user: user.toJSON() });
});

/**
 * POST /api/auth/login
 * Verifies credentials and issues a session. Uses a generic message so it does
 * not reveal whether the email exists.
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+passwordHash');
  const ok = user ? await user.verifyPassword(password) : false;
  if (!user || !ok) {
    throw new ApiError(401, 'Invalid email or password');
  }

  issueSession(res, user._id);
  return sendSuccess(res, 200, { user: user.toJSON() });
});

/**
 * POST /api/auth/logout
 * Clears the session cookies. Protected + CSRF-guarded so it can't be forced.
 */
export const logout = asyncHandler(async (_req, res) => {
  clearSession(res);
  return sendSuccess(res, 200, { loggedOut: true });
});

/**
 * GET /api/auth/me
 * Returns the current user (requireAuth attached req.user).
 */
export const me = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, { user: req.user.toJSON() });
});
