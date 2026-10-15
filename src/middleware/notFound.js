import { ApiError } from '../utils/ApiError.js';

/** Catch-all for unmatched routes → 404 via the error handler. */
export function notFound(req, _res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}
