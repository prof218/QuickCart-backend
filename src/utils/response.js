/**
 * Consistent JSON envelope helpers.
 * Success: { success: true, data }
 * Error:   { success: false, error: { message, details? } }  (built in errorHandler)
 */
export function sendSuccess(res, statusCode, data) {
  return res.status(statusCode).json({ success: true, data });
}
