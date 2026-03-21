import { Response, NextFunction } from 'express'
import { pool } from '../models/db'
import { AuthRequest } from '../types'

const ROLE_HIERARCHY: Record<string, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
}

export function requireWorkspaceRole(minRole: 'viewer' | 'editor' | 'admin') {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const workspaceId = req.params.workspaceId
    if (!workspaceId) {
      res.status(400).json({ error: 'workspaceId is required' })
      return
    }

    const { rows } = await pool.query<{ role: string }>(
      `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, req.user.id]
    )

    if (!rows[0]) {
      res.status(403).json({ error: 'Not a workspace member' })
      return
    }

    const userLevel = ROLE_HIERARCHY[rows[0].role] ?? 0
    const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0

    if (userLevel < requiredLevel) {
      res.status(403).json({ error: `Requires ${minRole} role or higher` })
      return
    }

    req.workspaceId = workspaceId
    req.workspaceRole = rows[0].role
    next()
  }
}
