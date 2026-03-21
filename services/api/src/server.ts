import 'dotenv/config'
import { createApp } from './app'
import cfg from './lib/config'
import { logger } from './lib/logger'
import { pool } from './models/db'

async function connectWithRetry(retries = 5, baseDelayMs = 2000): Promise<void> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const client = await pool.connect()
      await client.query('SELECT 1')
      client.release()
      logger.info('postgres_connected')
      return
    } catch (err) {
      if (attempt === retries - 1) throw err
      const delay = baseDelayMs * Math.pow(2, attempt)
      logger.warn('postgres_connection_retry', {
        attempt: attempt + 1,
        retries,
        retryInMs: delay,
        error: String(err),
      })
      await new Promise((r) => setTimeout(r, delay))
    }
  }
}

async function main() {
  // Retry DB connection before accepting requests — prevents failed boot
  // if Postgres is still initialising (common in Docker Compose)
  await connectWithRetry()

  const app = createApp()

  const server = app.listen(cfg.port, () => {
    logger.info('server_started', {
      port: cfg.port,
      env: cfg.nodeEnv,
      ragUrl: cfg.ragServiceUrl,
      agentUrl: cfg.agentServiceUrl,
    })
  })

  async function gracefulShutdown(signal: string) {
    logger.info('shutdown_signal_received', { signal })

    // Stop accepting new connections
    server.close(async () => {
      try {
        await pool.end()
        logger.info('postgres_pool_closed')
      } catch (e) {
        logger.error('pool_close_error', { error: String(e) })
      }
      logger.info('server_shutdown_complete')
      process.exit(0)
    })

    // Force exit if clean shutdown takes > 10s
    setTimeout(() => {
      logger.error('forced_shutdown_timeout')
      process.exit(1)
    }, 10_000).unref()
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled_rejection', { reason: String(reason) })
  })
  process.on('uncaughtException', (err) => {
    logger.error('uncaught_exception', { error: String(err) })
    process.exit(1)
  })
}

main().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
