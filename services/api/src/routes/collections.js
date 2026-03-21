import express from 'express'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { pool } from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'
import { requireWorkspaceRole } from '../middleware/rbac.js'

export const collectionRouter = express.Router()

const createCollectionSchema = z.object({
  name: z.string().min(1).max(255),
})

const addDocumentsSchema = z.object({
  document_ids: z.array(z.string().uuid()).min(1),
})

collectionRouter.use(authenticate)

/**
 * Create a document collection in a workspace.
 */
collectionRouter.post('/workspaces/:workspaceId/collections', requireWorkspaceRole('editor'), async (req, res, next) => {
  try {
    const input = createCollectionSchema.parse(req.body)
    const id = uuidv4()

    const { rows } = await pool.query(
      `INSERT INTO collections (id, workspace_id, name, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, workspace_id, name, created_at`,
      [id, req.workspaceId, input.name, req.user.id]
    )

    res.status(201).json(rows[0])
  } catch (err) {
    next(err)
  }
})

/**
 * List workspace collections with document counts.
 */
collectionRouter.get('/workspaces/:workspaceId/collections', requireWorkspaceRole('viewer'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.workspace_id, c.name, c.created_at,
              COUNT(cd.document_id)::int AS document_count
       FROM collections c
       LEFT JOIN collection_documents cd ON cd.collection_id = c.id
       WHERE c.workspace_id = $1
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [req.workspaceId]
    )

    res.json({ collections: rows })
  } catch (err) {
    next(err)
  }
})

/**
 * Add documents to a collection.
 */
collectionRouter.post('/workspaces/:workspaceId/collections/:collId/documents', requireWorkspaceRole('editor'), async (req, res, next) => {
  try {
    const input = addDocumentsSchema.parse(req.body)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      for (const documentId of input.document_ids) {
        await client.query(
          `INSERT INTO collection_documents (collection_id, document_id)
           SELECT c.id, d.id
           FROM collections c
           JOIN documents d ON d.id = $2
           WHERE c.id = $1
             AND c.workspace_id = $3
             AND d.workspace_id = $3
           ON CONFLICT DO NOTHING`,
          [req.params.collId, documentId, req.workspaceId]
        )
      }

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    res.status(201).json({ added: input.document_ids.length })
  } catch (err) {
    next(err)
  }
})

/**
 * Remove a document from a collection.
 */
collectionRouter.delete('/workspaces/:workspaceId/collections/:collId/documents/:docId', requireWorkspaceRole('editor'), async (req, res, next) => {
  try {
    await pool.query(
      `DELETE FROM collection_documents cd
       USING collections c
       WHERE cd.collection_id = c.id
         AND cd.collection_id = $1
         AND cd.document_id = $2
         AND c.workspace_id = $3`,
      [req.params.collId, req.params.docId, req.workspaceId]
    )

    res.json({ removed: true })
  } catch (err) {
    next(err)
  }
})
