import 'express-async-errors'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import compression from 'compression'
import rateLimit from 'express-rate-limit'

import cfg from './lib/config'
import { requestId } from './middleware/requestId'
import { httpLogger } from './middleware/requestLogger'
import { errorHandler } from './middleware/errorHandler'
import { healthRouter } from './routes/health'
import { authRouter } from './routes/auth'
import { workspaceRouter } from './routes/workspaces'
import { documentRouter } from './routes/documents'
import { analyticsRouter } from './routes/analytics'
import { collectionRouter } from './routes/collections'

export function createApp(): express.Application {
  const app = express()

  app.set('trust proxy', 1)

  // ── Security ──────────────────────────────────────────────────
  app.use(helmet())
  app.use(
    cors({
      origin: cfg.allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    })
  )

  // ── Performance ───────────────────────────────────────────────
  app.use(compression())

  // ── Request ID + Logging ──────────────────────────────────────
  app.use(requestId)
  app.use(httpLogger)

  // ── Body parsing ──────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true }))

  // ── Global rate limit ─────────────────────────────────────────
  const globalLimiter = rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests' },
  })
  app.use('/api', globalLimiter)

  // ── Routes ────────────────────────────────────────────────────
  app.use(healthRouter)
  app.use('/api/auth', authRouter)
  app.use('/api/workspaces', workspaceRouter)
  app.use('/api', documentRouter)
  app.use('/api', analyticsRouter)
  app.use('/api', collectionRouter)

  // ── 404 ───────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  // ── Error handler ─────────────────────────────────────────────
  app.use(errorHandler)

  return app
}
