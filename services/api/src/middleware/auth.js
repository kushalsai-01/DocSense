/**
 * JWT authentication middleware.
 *
 * WHY verify on every request instead of session cookies?
 * JWTs are stateless — the API gateway doesn't need sticky sessions or
 * server-side session storage.  The token itself contains the user's identity.
 * This is critical for horizontal scaling: any API instance can verify the token.
 *
 * @module middleware/auth
 */

import jwt from 'jsonwebtoken'
import cfg from '../config.js'
import { pool } from '../db/pool.js'

/**
 * Verify the Bearer token and attach `req.user` with { id, email, name }.
 * Returns 401 if token is missing, expired, or user no longer exists.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function authenticate(req, res, next) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'No authentication token provided' })
  }

  try {
    const payload = jwt.verify(token, cfg.jwtSecret)

    // WHY verify the user still exists?  Tokens are long-lived (up to 15min).
    // A user could be deleted or deactivated between issuance and use.
    const { rows } = await pool.query(
      'SELECT id, email, name FROM users WHERE id = $1',
      [payload.userId]
    )

    if (!rows[0]) {
      return res.status(401).json({ error: 'User no longer exists' })
    }

    req.user = rows[0]
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' })
    }
    return res.status(401).json({ error: 'Invalid token' })
  }
}
