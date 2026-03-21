import { createHash } from 'crypto'
import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import Redis from 'ioredis'
import cfg from '../lib/config'
import { pool } from '../models/db'
import { JwtPayload, AuthRequest } from '../types'
import { logger } from '../lib/logger'

/** Deterministic 64-char key derived from a JWT — avoids 500-char Redis keys. */
function tokenKey(token: string): string {
  return `blacklist:${createHash('sha256').update(token).digest('hex')}`
}

// Shared Redis client for token blacklist checks.
// lazyConnect so it never throws at module load time.
const redis = new Redis(cfg.redisUrl, {
  tls: cfg.redisTlsEnabled ? {} : undefined,
  lazyConnect: true,
  enableOfflineQueue: false,
})

redis.on('error', (err: Error) => {
  logger.warn('auth_redis_error', { error: err.message })
})

/**
 * Blacklist an access token so it is rejected immediately on logout.
 * TTL matches the access token lifetime (15 min default).
 */
export async function blacklistToken(token: string, ttlSeconds = 900): Promise<void> {
  if (redis.status !== 'ready') return
  try {
    await redis.setex(tokenKey(token), ttlSeconds, '1')
  } catch (err) {
    logger.warn('blacklist_set_failed', { error: String(err) })
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    res.status(401).json({ error: 'No authentication token provided' })
    return
  }

  // Check token blacklist (logout'd tokens)
  if (redis.status === 'ready') {
    try {
      const isBlacklisted = await redis.get(tokenKey(token))
      if (isBlacklisted) {
        res.status(401).json({ error: 'Token revoked', code: 'TOKEN_REVOKED' })
        return
      }
    } catch {
      // Redis unavailable — allow the request through (fail-open)
    }
  }

  try {
    const payload = jwt.verify(token, cfg.jwtSecret) as JwtPayload

    const { rows } = await pool.query<{ id: string; email: string; name: string }>(
      'SELECT id, email, name FROM users WHERE id = $1',
      [payload.userId]
    )

    if (!rows[0]) {
      res.status(401).json({ error: 'User no longer exists' })
      return
    }

    (req as AuthRequest).user = rows[0]
    next()
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' })
      return
    }
    res.status(401).json({ error: 'Invalid token' })
  }
}
