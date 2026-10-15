import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { config } from '../config/env.js';

/**
 * Centralized error handler. Translates known error types into a consistent
 * JSON envelope: { success:false, error:{ message, details? } }.
 *
 * Security: we never echo back request bodies and never log payment signatures,
 * access tokens, or secrets. Only the error message/stack is logged.
 */
// eslint-disable-next-line no-unused-vars -- Express needs the 4-arg signature
export function errorHandler(err, _req, res, _next) {
  let statusCode = 500;
  let message = 'Internal server error';
  let details = null;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({
      path: e.path,
      message: e.message,
    }));
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = `Invalid value for "${err.path}"`;
  } else if (err?.code === 11000) {
    statusCode = 409;
    message = 'Duplicate key error';
    details = err.keyValue ? Object.keys(err.keyValue) : null;
  } else if (err?.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Malformed JSON in request body';
  }

  // Log server-side (no secrets, no request body).
  if (statusCode >= 500) {
    console.error(`[error] ${statusCode} ${message}`, err?.stack || err);
  } else {
    console.warn(`[warn] ${statusCode} ${message}`);
  }

  const body = { success: false, error: { message } };
  if (details) body.error.details = details;
  if (config.nodeEnv !== 'production' && statusCode >= 500 && err?.stack) {
    body.error.stack = err.stack;
  }

  res.status(statusCode).json(body);
}
