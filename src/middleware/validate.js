import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';

/**
 * Returns middleware that validates req.body against a Zod schema.
 * On success, req.body is replaced with the parsed/coerced value.
 * On failure, forwards a 400 ApiError with structured issue details.
 */
export const validateBody = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    return next(new ApiError(400, 'Validation failed', details));
  }
  req.body = result.data;
  next();
};

/**
 * Validates that a route param is a well-formed MongoDB ObjectId.
 */
export const validateObjectId = (paramName = 'id') => (req, _res, next) => {
  const value = req.params[paramName];
  if (!mongoose.isValidObjectId(value)) {
    return next(new ApiError(400, `Invalid ${paramName}`));
  }
  next();
};
