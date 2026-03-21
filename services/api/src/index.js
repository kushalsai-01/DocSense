/**
 * Application entry point.
 *
 * WHY Express 5?
 * Express 5 natively supports async route handlers — thrown/rejected errors
 * automatically propagate to the error handler middleware.  No need for the
 * express-async-errors hack or try/catch wrappers on every route.
 *
 * @module index
 */

import 'dotenv/config'
import express from 'express'
import cors from 'cors'

import cfg from './config.js'
import { authRouter } from './routes/auth.js'
import { workspaceRouter } from './routes/workspaces.js'
import { documentRouter } from './routes/documents.js'
import { queryRouter } from './routes/query.js'
import { analyticsRouter } from './routes/analytics.js'
import { collectionRouter } from './routes/collections.js'
import { errorHandler } from './middleware/errorHandler.js'

const app = express()

// ── Global middleware ─────────────────────────────────────────
app.use(cors({ origin: cfg.allowedOrigins, credentials: true }))
app.use(express.json({ limit: '10mb' }))

// ── Health check (no auth required) ──────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'api-gateway', timestamp: Date.now() })
})

// ── Route mounting ────────────────────────────────────────────
app.use('/api/auth', authRouter)
app.use('/api/workspaces', workspaceRouter)
app.use('/api', documentRouter)
app.use('/api', queryRouter)
app.use('/api', analyticsRouter)
app.use('/api', collectionRouter)

// ── Error handler (must be last) ──────────────────────────────
app.use(errorHandler)

// ── Start server ──────────────────────────────────────────────
app.listen(cfg.port, () => {
  console.log(`🚀 DocSense API running on port ${cfg.port} [${cfg.nodeEnv}]`)
})

export default app
