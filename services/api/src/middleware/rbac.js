/**
 * Role-based access control middleware for workspace operations.
 *
 * WHY a numeric role hierarchy instead of a permissions matrix?
 * For this domain (admin > editor > viewer), a simple numeric comparison
 * is sufficient and much easier to reason about.  A full ACL system would
 * be overkill since all higher roles implicitly have lower-role permissions.
 *
 * Role hierarchy: admin=3, editor=2, viewer=1
 *
 * @module middleware/rbac
 */

import { pool } from '../db/pool.js'

/** @type {Record<string, number>} */
const ROLE_LEVEL = { admin: 3, editor: 2, viewer: 1 }

/**
 * Factory that returns middleware enforcing a minimum workspace role.
 *
 * The workspace ID is read from:
 *   1. req.params.workspaceId  (URL path param)
 *   2. req.body.workspace_id   (request body)
 *
 * On success, sets `req.workspaceRole` and `req.workspaceId`.
 *
 * @param {'admin' | 'editor' | 'viewer'} minRole - Minimum required role
 * @returns {import('express').RequestHandler}
 */
export function requireWorkspaceRole(minRole) {
  const requiredLevel = ROLE_LEVEL[minRole]

  return async (req, res, next) => {
    const workspaceId = req.params.workspaceId || req.body?.workspace_id

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspace_id is required' })
    }

    try {
      const { rows } = await pool.query(
        `SELECT role FROM workspace_members
         WHERE workspace_id = $1 AND user_id = $2`,
        [workspaceId, req.user.id]
      )

      if (!rows[0]) {
        return res.status(403).json({ error: 'You are not a member of this workspace' })
      }

      const userLevel = ROLE_LEVEL[rows[0].role]

      if (userLevel < requiredLevel) {
        return res.status(403).json({
          error: `Requires '${minRole}' role. You have '${rows[0].role}'.`,
        })
      }

      // Attach workspace context to request for downstream handlers
      req.workspaceRole = rows[0].role
      req.workspaceId = workspaceId
      next()
    } catch (err) {
      next(err)
    }
  }
}
