import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { pool, withTransaction } from '../models/db'
import { authenticate } from '../middleware/auth'
import { requireWorkspaceRole } from '../middleware/rbac'
import { AuthRequest } from '../types'

export const workspaceRouter = Router()

const createWsSchema = z.object({ name: z.string().min(1).max(255) })
const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'editor', 'viewer']),
})
const updateRoleSchema = z.object({ role: z.enum(['admin', 'editor', 'viewer']) })

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

workspaceRouter.use(authenticate)

workspaceRouter.get('/', async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const { rows } = await pool.query(
    `SELECT w.id, w.name, w.slug, w.owner_id, w.created_at, w.updated_at, wm.role
     FROM workspace_members wm
     JOIN workspaces w ON w.id = wm.workspace_id
     WHERE wm.user_id = $1 ORDER BY w.created_at DESC`,
    [authReq.user.id]
  )
  res.json({ workspaces: rows })
})

workspaceRouter.post('/', async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const input = createWsSchema.parse(req.body)
  const slug = `${slugify(input.name) || 'workspace'}-${Math.random().toString(36).slice(2, 6)}`
  const qdrantNamespace = `ws_${uuidv4()}`

  const ws = await withTransaction(async (client) => {
    const wsResult = await client.query(
      `INSERT INTO workspaces (name, slug, owner_id, qdrant_namespace)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [input.name, slug, authReq.user.id, qdrantNamespace]
    )
    await client.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role, invited_by)
       VALUES ($1,$2,'admin',$2)`,
      [wsResult.rows[0].id, authReq.user.id]
    )
    return wsResult.rows[0]
  })

  res.status(201).json(ws)
})

workspaceRouter.get('/:workspaceId', requireWorkspaceRole('viewer'), async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const [ws, members] = await Promise.all([
    pool.query('SELECT * FROM workspaces WHERE id = $1', [authReq.workspaceId]),
    pool.query(
      `SELECT wm.user_id, u.email, u.name, wm.role, wm.joined_at
       FROM workspace_members wm JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = $1 ORDER BY wm.joined_at ASC`,
      [authReq.workspaceId]
    ),
  ])
  if (!ws.rows[0]) {
    res.status(404).json({ error: 'Workspace not found' })
    return
  }
  res.json({ ...ws.rows[0], members: members.rows })
})

workspaceRouter.delete('/:workspaceId', requireWorkspaceRole('admin'), async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  await pool.query('DELETE FROM workspaces WHERE id = $1', [authReq.workspaceId])
  res.json({ deleted: true })
})

workspaceRouter.post('/:workspaceId/members', requireWorkspaceRole('admin'), async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const input = addMemberSchema.parse(req.body)
  const { rows } = await pool.query('SELECT id, email, name FROM users WHERE email = $1', [input.email])
  if (!rows[0]) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  await pool.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role, invited_by)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [authReq.workspaceId, rows[0].id, input.role, authReq.user.id]
  )
  res.status(201).json({ user: rows[0], role: input.role })
})

workspaceRouter.put('/:workspaceId/members/:userId', requireWorkspaceRole('admin'), async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const { role } = updateRoleSchema.parse(req.body)
  await pool.query(
    'UPDATE workspace_members SET role = $1 WHERE workspace_id = $2 AND user_id = $3',
    [role, authReq.workspaceId, req.params.userId]
  )
  res.json({ updated: true, role })
})

workspaceRouter.delete('/:workspaceId/members/:userId', requireWorkspaceRole('admin'), async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const ws = await pool.query('SELECT owner_id FROM workspaces WHERE id = $1', [authReq.workspaceId])
  if (!ws.rows[0]) {
    res.status(404).json({ error: 'Workspace not found' })
    return
  }
  if (ws.rows[0].owner_id === req.params.userId) {
    res.status(400).json({ error: 'Cannot remove workspace owner' })
    return
  }
  await pool.query(
    'DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
    [authReq.workspaceId, req.params.userId]
  )
  res.json({ removed: true })
})
