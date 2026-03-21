import express from 'express'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { pool } from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'
import { requireWorkspaceRole } from '../middleware/rbac.js'
import { slugify } from '../utils/slugify.js'

export const workspaceRouter = express.Router()

const createWorkspaceSchema = z.object({ name: z.string().min(1).max(255) })
const addMemberSchema = z.object({ email: z.string().email(), role: z.enum(['admin', 'editor', 'viewer']) })
const updateRoleSchema = z.object({ role: z.enum(['admin', 'editor', 'viewer']) })

workspaceRouter.use(authenticate)

/**
 * List all workspaces where the current user is a member.
 */
workspaceRouter.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT w.id, w.name, w.slug, w.owner_id, w.created_at, w.updated_at, wm.role
       FROM workspace_members wm
       JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.user_id = $1
       ORDER BY w.created_at DESC`,
      [req.user.id]
    )
    res.json({ workspaces: rows })
  } catch (err) {
    next(err)
  }
})

/**
 * Create a workspace and add creator as admin.
 */
workspaceRouter.post('/', async (req, res, next) => {
  try {
    const input = createWorkspaceSchema.parse(req.body)
    const base = slugify(input.name) || 'workspace'
    const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`
    const qdrantNamespace = `ws_${uuidv4()}`

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const wsResult = await client.query(
        `INSERT INTO workspaces (name, slug, owner_id, qdrant_namespace)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [input.name, slug, req.user.id, qdrantNamespace]
      )

      await client.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role, invited_by)
         VALUES ($1, $2, 'admin', $2)`,
        [wsResult.rows[0].id, req.user.id]
      )

      await client.query('COMMIT')
      res.status(201).json(wsResult.rows[0])
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
 * Get workspace details with member list.
 */
workspaceRouter.get('/:workspaceId', requireWorkspaceRole('viewer'), async (req, res, next) => {
  try {
    const [workspace, members] = await Promise.all([
      pool.query('SELECT * FROM workspaces WHERE id = $1', [req.workspaceId]),
      pool.query(
        `SELECT wm.user_id, u.email, u.name, wm.role, wm.joined_at
         FROM workspace_members wm
         JOIN users u ON u.id = wm.user_id
         WHERE wm.workspace_id = $1
         ORDER BY wm.joined_at ASC`,
        [req.workspaceId]
      ),
    ])

    if (!workspace.rows[0]) {
      return res.status(404).json({ error: 'Workspace not found' })
    }

    res.json({ ...workspace.rows[0], members: members.rows })
  } catch (err) {
    next(err)
  }
})

/**
 * Delete workspace (admin only).
 */
workspaceRouter.delete('/:workspaceId', requireWorkspaceRole('admin'), async (req, res, next) => {
  try {
    await pool.query('DELETE FROM workspaces WHERE id = $1', [req.workspaceId])
    res.json({ deleted: true })
  } catch (err) {
    next(err)
  }
})

/**
 * Add a user to workspace by email.
 */
workspaceRouter.post('/:workspaceId/members', requireWorkspaceRole('admin'), async (req, res, next) => {
  try {
    const input = addMemberSchema.parse(req.body)

    const userResult = await pool.query('SELECT id, email, name FROM users WHERE email = $1', [input.email])
    const targetUser = userResult.rows[0]
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' })
    }

    await pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role, invited_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (workspace_id, user_id)
       DO UPDATE SET role = EXCLUDED.role`,
      [req.workspaceId, targetUser.id, input.role, req.user.id]
    )

    res.status(201).json({ user: targetUser, role: input.role })
  } catch (err) {
    next(err)
  }
})

/**
 * Update member role.
 */
workspaceRouter.put('/:workspaceId/members/:userId', requireWorkspaceRole('admin'), async (req, res, next) => {
  try {
    const input = updateRoleSchema.parse(req.body)
    await pool.query(
      `UPDATE workspace_members
       SET role = $1
       WHERE workspace_id = $2 AND user_id = $3`,
      [input.role, req.workspaceId, req.params.userId]
    )

    res.json({ updated: true, role: input.role })
  } catch (err) {
    next(err)
  }
})

/**
 * Remove member from workspace, disallowing owner removal.
 */
workspaceRouter.delete('/:workspaceId/members/:userId', requireWorkspaceRole('admin'), async (req, res, next) => {
  try {
    const ws = await pool.query('SELECT owner_id FROM workspaces WHERE id = $1', [req.workspaceId])
    if (!ws.rows[0]) return res.status(404).json({ error: 'Workspace not found' })

    if (ws.rows[0].owner_id === req.params.userId) {
      return res.status(400).json({ error: 'Cannot remove workspace owner' })
    }

    await pool.query(
      'DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [req.workspaceId, req.params.userId]
    )

    res.json({ removed: true })
  } catch (err) {
    next(err)
  }
})
