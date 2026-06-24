/**
 * Consistent error shape across the API:  { error: { code, message } }
 * Throw an AppError anywhere; the handler below serialises it.
 */
export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Common helpers
export const badRequest = (code, msg) => new AppError(400, code, msg);
export const unauthorized = (msg = 'Authentication required.') =>
  new AppError(401, 'UNAUTHORIZED', msg);
export const conflict = (code, msg) => new AppError(409, code, msg);
export const notFound = (code, msg) => new AppError(404, code, msg);

/** Wrap async route handlers so thrown/rejected errors reach the handler. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/** Central Express error handler — must be registered last. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  console.error('Unhandled error:', err);
  return res.status(500).json({
    error: { code: 'INTERNAL', message: 'Something went wrong.' },
  });
}
