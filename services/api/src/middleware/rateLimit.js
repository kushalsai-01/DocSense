/**
 * Sliding-window rate limiting middleware backed by Redis.
 *
 * WHY this algorithm?
 * We bucket requests by user and time window and increment a Redis counter.
 * This is simple, fast, and horizontally scalable because all API instances
 * share Redis state.
 *
 * Key format:
 *   ratelimit:{userId}:{windowBucket}
 * where windowBucket = floor(now / windowMs)
 */

import Redis from 'ioredis'
import cfg from '../config.js'

const redis = new Redis(cfg.redisUrl, {
  tls: cfg.redisTlsEnabled ? {} : undefined,
})

/**
 * Create a rate limiter middleware.
 *
 * @param {{ windowMs: number, maxRequests: number }} options
 * @returns {import('express').RequestHandler}
 */
export function rateLimit({ windowMs, maxRequests }) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id || 'anonymous'
      const bucket = Math.floor(Date.now() / windowMs)
      const key = `ratelimit:${userId}:${bucket}`

      const count = await redis.incr(key)

      if (count === 1) {
        await redis.expire(key, Math.ceil(windowMs / 1000))
      }

      res.setHeader('X-RateLimit-Limit', maxRequests)
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - count))

      if (count > maxRequests) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          retryAfter: Math.ceil(windowMs / 1000),
        })
      }

      next()
    } catch (err) {
      // Fail-open to avoid global outage if Redis is unavailable.
      next()
    }
  }
}
