/**
 * Global error handler middleware.
 *
 * WHY a global handler instead of try/catch in every route?
 * Express 5 automatically catches async errors and routes them here.
 * This centralises error formatting, logging, and status code selection
 * so routes can just `throw` or call `next(err)`.
 *
 * @module middleware/errorHandler
 */

/**
 * Express error-handling middleware (4 arguments).
 *
 * @param {Error & { statusCode?: number, code?: string }} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
export function errorHandler(err, req, res, _next) {
  // ── Determine HTTP status code ──────────────────────────────
  const statusCode = err.statusCode || 500

  // ── Log the error (full stack in dev, message only in prod) ─
  if (statusCode >= 500) {
    console.error(`❌ [${req.method} ${req.path}]`, err.stack || err.message)
  } else {
    console.warn(`⚠️  [${req.method} ${req.path}] ${err.message}`)
  }

  // ── Build response ──────────────────────────────────────────
  const response = {
    error: statusCode >= 500 ? 'Internal server error' : err.message,
    ...(err.code && { code: err.code }),
    ...(process.env.NODE_ENV === 'development' && statusCode >= 500 && {
      // WHY only in development?  Exposing stack traces in production
      // leaks internals that could be exploited.
      stack: err.stack,
      detail: err.message,
    }),
  }

  res.status(statusCode).json(response)
}

/**
 * Helper to create an error with a specific HTTP status code.
 *
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @returns {Error & { statusCode: number }}
 */
export function httpError(statusCode, message) {
  const err = new Error(message)
  err.statusCode = statusCode
  return err
}
