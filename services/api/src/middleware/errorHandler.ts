import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { logger } from '../lib/logger'
import { AppError } from '../types'

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
    return
  }

  const appErr = err as AppError
  const statusCode = appErr.statusCode ?? 500

  if (statusCode < 500) {
    res.status(statusCode).json({ error: err.message })
    return
  }

  logger.error('unhandled_error', {
    error: err.message,
    stack: err.stack,
    requestId: req.requestId,
    method: req.method,
    path: req.path,
  })

  res.status(500).json({ error: 'Internal server error' })
}
