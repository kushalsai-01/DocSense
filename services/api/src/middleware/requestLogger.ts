import { Request, Response, NextFunction } from 'express'
import { requestLogger } from '../lib/logger'
import { AuthRequest } from '../types'

export function httpLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now()

  res.on('finish', () => {
    const userId = (req as AuthRequest).user?.id
    requestLogger(
      req.method,
      req.path,
      res.statusCode,
      Date.now() - start,
      req.requestId,
      userId
    )
  })

  next()
}
