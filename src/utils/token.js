import crypto from 'node:crypto';

/**
 * Guest-order access token helpers.
 *
 * We generate a high-entropy random token, return the PLAINTEXT to the client
 * exactly once (in the create-order response), and persist ONLY its SHA-256 hash.
 * Retrieving an order requires presenting the original token, which we hash and
 * compare in constant time. The plaintext token is never logged or stored.
 */

/** Generate a 256-bit random token as a 64-char hex string. */
export function generateAccessToken() {
  return crypto.randomBytes(32).toString('hex');
}

/** SHA-256 hash of a token (hex). Safe to store in the database. */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Constant-time comparison between a presented token and a stored hash.
 * Returns false (never throws) on any malformed/missing input.
 */
export function verifyToken(presentedToken, storedHash) {
  if (typeof presentedToken !== 'string' || typeof storedHash !== 'string') {
    return false;
  }
  const presentedHash = hashToken(presentedToken);
  const a = Buffer.from(presentedHash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
