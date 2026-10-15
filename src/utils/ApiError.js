/**
 * Operational error with an HTTP status code.
 * Thrown by controllers/services and translated to a JSON response
 * by the centralized error handler.
 */
export class ApiError extends Error {
  /**
   * @param {number} statusCode HTTP status code
   * @param {string} message Human-readable message (safe to return to clients)
   * @param {Array|object|null} [details] Optional structured detail (e.g. validation issues)
   */
  constructor(statusCode, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }
}
