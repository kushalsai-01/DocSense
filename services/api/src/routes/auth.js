import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import Redis from 'ioredis'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import cfg from '../config.js'
import { pool } from '../db/pool.js'
import { slugify } from '../utils/slugify.js'

export const authRouter = express.Router()
const redis = new Redis(cfg.redisUrl, {
  tls: cfg.redisTlsEnabled ? {} : undefined,
})

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
})

/**
 * Convert a short duration string like 7d/15m into seconds for Redis TTL.
 *
 * @param {string} duration
 * @returns {number}
 */
function durationToSeconds(duration) {
  const match = duration.match(/^(\d+)([smhd])$/)
  if (!match) return 60 * 60 * 24 * 7
  const value = Number(match[1])
  const unit = match[2]
  if (unit === 's') return value
  if (unit === 'm') return value * 60
  if (unit === 'h') return value * 60 * 60
  return value * 60 * 60 * 24
}

/**
 * Create access and refresh JWT tokens and persist refresh token in Redis.
 *
 * @param {{ id: string, email: string }} user
 * @returns {Promise<{ accessToken: string, refreshToken: string }>}
 */
async function createTokenPair(user) {
  const tokenId = uuidv4()
  const payload = { userId: user.id, email: user.email }

  const accessToken = jwt.sign(payload, cfg.jwtSecret, { expiresIn: cfg.jwtAccessExpiry })
  const refreshToken = jwt.sign({ ...payload, tokenId, type: 'refresh' }, cfg.jwtSecret, {
    expiresIn: cfg.jwtRefreshExpiry,
  })

  const key = `refresh:${user.id}:${tokenId}`
  const ttl = durationToSeconds(cfg.jwtRefreshExpiry)
  await redis.set(key, '1', 'EX', ttl)

  return { accessToken, refreshToken }
}

/**
 * Register a new user and create a default personal workspace.
 */
authRouter.post('/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body)
    const client = await pool.connect()

    try {
      await client.query('BEGIN')

      const exists = await client.query('SELECT id FROM users WHERE email = $1', [input.email])
      if (exists.rows[0]) {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: 'Email already registered' })
      }

      const passwordHash = await bcrypt.hash(input.password, 12)
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, name)
         VALUES ($1, $2, $3)
         RETURNING id, email, name`,
        [input.email, passwordHash, input.name]
      )

      const user = userResult.rows[0]
      const baseSlug = slugify(`${input.name}-personal`) || 'workspace'
      const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`
      const qdrantNamespace = `ws_${uuidv4()}`

      const workspaceResult = await client.query(
        `INSERT INTO workspaces (name, slug, owner_id, qdrant_namespace)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, slug`,
        [`${input.name}'s Workspace`, slug, user.id, qdrantNamespace]
      )

      await client.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role, invited_by)
         VALUES ($1, $2, 'admin', $2)`,
        [workspaceResult.rows[0].id, user.id]
      )

      await client.query('COMMIT')

      const { accessToken, refreshToken } = await createTokenPair(user)

      return res.status(201).json({
        token: accessToken,
        refreshToken,
        user,
        workspace: workspaceResult.rows[0],
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    next(err)
  }
})

/**
 * Authenticate an existing user and return JWT tokens.
 */
authRouter.post('/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body)

    const { rows } = await pool.query(
      'SELECT id, email, name, password_hash FROM users WHERE email = $1',
      [input.email]
    )

    if (!rows[0]) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const isValid = await bcrypt.compare(input.password, rows[0].password_hash)
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const user = { id: rows[0].id, email: rows[0].email, name: rows[0].name }
    const { accessToken, refreshToken } = await createTokenPair(user)

    return res.json({ token: accessToken, refreshToken, user })
  } catch (err) {
    next(err)
  }
})

/**
 * Verify refresh token and issue a fresh access token.
 */
authRouter.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body)
    const payload = jwt.verify(refreshToken, cfg.jwtSecret)

    if (payload.type !== 'refresh' || !payload.tokenId) {
      return res.status(401).json({ error: 'Invalid refresh token' })
    }

    const key = `refresh:${payload.userId}:${payload.tokenId}`
    const exists = await redis.get(key)

    if (!exists) {
      return res.status(401).json({ error: 'Refresh token expired or revoked' })
    }

    const token = jwt.sign({ userId: payload.userId, email: payload.email }, cfg.jwtSecret, {
      expiresIn: cfg.jwtAccessExpiry,
    })

    return res.json({ token })
  } catch (err) {
    next(err)
  }
})
