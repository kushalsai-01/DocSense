import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import Redis from 'ioredis'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import cfg from '../lib/config'
import { pool } from '../models/db'
import { authenticate, blacklistToken } from '../middleware/auth'
import { AuthRequest, JwtPayload } from '../types'
import { logger } from '../lib/logger'
import { getFirebaseAdminAuth, isFirebaseAdminConfigured } from '../lib/firebaseAdmin'

export const authRouter = Router()

const redis = new Redis(cfg.redisUrl, {
  tls: cfg.redisTlsEnabled ? {} : undefined,
  lazyConnect: true,
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

const googleLoginSchema = z.object({
  idToken: z.string().min(20),
})

function durationToSeconds(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/)
  if (!match) return 60 * 60 * 24 * 7
  const value = Number(match[1])
  const unit = match[2]
  if (unit === 's') return value
  if (unit === 'm') return value * 60
  if (unit === 'h') return value * 3600
  return value * 86400
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

async function createTokenPair(user: { id: string; email: string }): Promise<{
  accessToken: string
  refreshToken: string
}> {
  const tokenId = uuidv4()
  const payload: JwtPayload = { userId: user.id, email: user.email }

  const accessToken = jwt.sign(payload, cfg.jwtSecret, {
    expiresIn: cfg.jwtAccessExpiry as jwt.SignOptions['expiresIn'],
  })
  const refreshToken = jwt.sign(
    { ...payload, tokenId, type: 'refresh' },
    cfg.jwtSecret,
    { expiresIn: cfg.jwtRefreshExpiry as jwt.SignOptions['expiresIn'] }
  )

  const key = `refresh:${user.id}:${tokenId}`
  const ttl = durationToSeconds(cfg.jwtRefreshExpiry)
  await redis.set(key, '1', 'EX', ttl)

  return { accessToken, refreshToken }
}

authRouter.post('/register', async (req: Request, res: Response) => {
  const input = registerSchema.parse(req.body)
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const exists = await client.query('SELECT id FROM users WHERE email = $1', [
      input.email,
    ])
    if (exists.rows[0]) {
      await client.query('ROLLBACK')
      res.status(409).json({ error: 'Email already registered' })
      return
    }

    const passwordHash = await bcrypt.hash(input.password, 12)
    const userResult = await client.query<{ id: string; email: string; name: string }>(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
      [input.email, passwordHash, input.name]
    )

    const user = userResult.rows[0]
    const baseSlug = slugify(`${input.name}-personal`) || 'workspace'
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`
    const qdrantNamespace = `ws_${uuidv4()}`

    const wsResult = await client.query(
      `INSERT INTO workspaces (name, slug, owner_id, qdrant_namespace)
       VALUES ($1, $2, $3, $4) RETURNING id, name, slug`,
      [`${input.name}'s Workspace`, slug, user.id, qdrantNamespace]
    )

    await client.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role, invited_by)
       VALUES ($1, $2, 'admin', $2)`,
      [wsResult.rows[0].id, user.id]
    )

    await client.query('COMMIT')
    const { accessToken, refreshToken } = await createTokenPair(user)

    logger.info('user_registered', { userId: user.id, email: user.email })
    res.status(201).json({
      token: accessToken,
      refreshToken,
      user,
      workspace: wsResult.rows[0],
    })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})

authRouter.post('/login', async (req: Request, res: Response) => {
  const input = loginSchema.parse(req.body)

  const { rows } = await pool.query<{
    id: string
    email: string
    name: string
    password_hash: string
  }>('SELECT id, email, name, password_hash FROM users WHERE email = $1', [input.email])

  if (!rows[0]) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }

  const isValid = await bcrypt.compare(input.password, rows[0].password_hash)
  if (!isValid) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }

  const user = { id: rows[0].id, email: rows[0].email, name: rows[0].name }
  const { accessToken, refreshToken } = await createTokenPair(user)

  logger.info('user_login', { userId: user.id })
  res.json({ token: accessToken, refreshToken, user })
})

authRouter.post('/google', async (req: Request, res: Response) => {
  if (!isFirebaseAdminConfigured()) {
    res.status(503).json({
      error:
        'Google sign-in is not configured on server. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.',
    })
    return
  }

  const { idToken } = googleLoginSchema.parse(req.body)
  const adminAuth = getFirebaseAdminAuth()
  const decoded = await adminAuth.verifyIdToken(idToken)
  const email = decoded.email

  if (!email) {
    res.status(400).json({ error: 'Google account email is required' })
    return
  }

  const displayName = (decoded.name?.trim() || email.split('@')[0] || 'User').slice(0, 255)
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    let userId: string
    let userName: string

    const existingUser = await client.query<{ id: string; email: string; name: string }>(
      'SELECT id, email, name FROM users WHERE email = $1',
      [email]
    )

    if (existingUser.rows[0]) {
      userId = existingUser.rows[0].id
      userName = existingUser.rows[0].name
    } else {
      const randomPasswordHash = await bcrypt.hash(uuidv4(), 12)
      const created = await client.query<{ id: string; email: string; name: string }>(
        'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
        [email, randomPasswordHash, displayName]
      )
      userId = created.rows[0].id
      userName = created.rows[0].name

      const baseSlug = slugify(`${displayName}-personal`) || 'workspace'
      const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`
      const qdrantNamespace = `ws_${uuidv4()}`
      const wsResult = await client.query<{ id: string }>(
        `INSERT INTO workspaces (name, slug, owner_id, qdrant_namespace)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [`${displayName}'s Workspace`, slug, userId, qdrantNamespace]
      )

      await client.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role, invited_by)
         VALUES ($1, $2, 'admin', $2)`,
        [wsResult.rows[0].id, userId]
      )
    }

    await client.query('COMMIT')

    const { accessToken, refreshToken } = await createTokenPair({ id: userId, email })
    logger.info('user_login_google', { userId, email })
    res.json({
      token: accessToken,
      refreshToken,
      user: { id: userId, email, name: userName },
    })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})

authRouter.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = refreshSchema.parse(req.body)
  const payload = jwt.verify(refreshToken, cfg.jwtSecret) as JwtPayload

  if (payload.type !== 'refresh' || !payload.tokenId) {
    res.status(401).json({ error: 'Invalid refresh token' })
    return
  }

  const key = `refresh:${payload.userId}:${payload.tokenId}`
  const exists = await redis.get(key)

  if (!exists) {
    res.status(401).json({ error: 'Refresh token expired or revoked' })
    return
  }

  const token = jwt.sign(
    { userId: payload.userId, email: payload.email },
    cfg.jwtSecret,
    { expiresIn: cfg.jwtAccessExpiry as jwt.SignOptions['expiresIn'] }
  )

  res.json({ token })
})

authRouter.post('/logout', authenticate, async (req: Request, res: Response) => {
  // Blacklist the current access token so it's immediately rejected
  const accessToken = req.headers.authorization?.slice(7)
  if (accessToken) {
    const ttl = durationToSeconds(cfg.jwtAccessExpiry)
    await blacklistToken(accessToken, ttl)
  }

  // Revoke the refresh token from Redis
  const { refreshToken } = req.body as { refreshToken?: string }
  if (refreshToken) {
    try {
      const payload = jwt.verify(refreshToken, cfg.jwtSecret) as JwtPayload
      if (payload.tokenId) {
        const key = `refresh:${payload.userId}:${payload.tokenId}`
        await redis.del(key)
      }
    } catch {
      // Token invalid — still return success
    }
  }
  res.json({ success: true })
})

authRouter.get('/me', authenticate, async (req: Request, res: Response) => {
  const user = (req as AuthRequest).user
  res.json({ user })
})

authRouter.put('/profile', authenticate, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const name = z.string().min(1).max(255).parse(req.body.name)

  const { rows } = await pool.query<{ id: string; email: string; name: string }>(
    'UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, name',
    [name, authReq.user.id]
  )

  logger.info('user_profile_updated', { userId: authReq.user.id })
  res.json({ user: rows[0] })
})

authRouter.delete('/account', authenticate, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const { password } = z.object({ password: z.string().min(1) }).parse(req.body)

  const { rows } = await pool.query<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id = $1',
    [authReq.user.id]
  )

  if (!rows[0]) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const valid = await bcrypt.compare(password, rows[0].password_hash)
  if (!valid) {
    res.status(401).json({ error: 'Incorrect password' })
    return
  }

  await pool.query('DELETE FROM users WHERE id = $1', [authReq.user.id])
  logger.info('user_account_deleted', { userId: authReq.user.id })
  res.status(204).end()
})
