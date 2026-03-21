import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { pool } from '../models/db'
import { authenticate } from '../middleware/auth'
import { requireWorkspaceRole } from '../middleware/rbac'
import { AuthRequest } from '../types'

export const collectionRouter = Router()

const createSchema = z.object({ name: z.string().min(1).max(255) })

collectionRouter.use(authenticate)

collectionRouter.get(
  '/workspaces/:workspaceId/collections',
  requireWorkspaceRole('viewer'),
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest
    const { rows } = await pool.query(
      `SELECT c.*, COUNT(cd.document_id)::int as document_count
       FROM collections c
       LEFT JOIN collection_documents cd ON cd.collection_id = c.id
       WHERE c.workspace_id = $1
       GROUP BY c.id ORDER BY c.created_at DESC`,
      [authReq.workspaceId]
    )
    res.json({ collections: rows })
  }
)

collectionRouter.post(
  '/workspaces/:workspaceId/collections',
  requireWorkspaceRole('editor'),
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest
    const { name } = createSchema.parse(req.body)
    const { rows } = await pool.query(
      `INSERT INTO collections (id, workspace_id, name, created_by)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [uuidv4(), authReq.workspaceId, name, authReq.user.id]
    )
    res.status(201).json(rows[0])
  }
)

collectionRouter.post(
  '/workspaces/:workspaceId/collections/:collId/documents',
  requireWorkspaceRole('editor'),
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest
    const { document_ids } = req.body as { document_ids: string[] }
    if (!Array.isArray(document_ids)) {
      res.status(400).json({ error: 'document_ids must be an array' })
      return
    }
    for (const docId of document_ids) {
      await pool.query(
        `INSERT INTO collection_documents (collection_id, document_id)
         VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [req.params.collId, docId]
      )
    }
    res.status(201).json({ added: document_ids.length })
  }
)

collectionRouter.delete(
  '/workspaces/:workspaceId/collections/:collId/documents/:docId',
  requireWorkspaceRole('editor'),
  async (req: Request, res: Response) => {
    await pool.query(
      'DELETE FROM collection_documents WHERE collection_id = $1 AND document_id = $2',
      [req.params.collId, req.params.docId]
    )
    res.json({ removed: true })
  }
)
