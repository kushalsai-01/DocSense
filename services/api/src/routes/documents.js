import express from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { pool } from '../db/pool.js'
import cfg from '../config.js'
import { authenticate } from '../middleware/auth.js'
import { requireWorkspaceRole } from '../middleware/rbac.js'
import { validateFile } from '../utils/validateFile.js'
import { extractText, chunkText } from '../services/fileProcessor.js'
import { saveUploadedFile, deleteStoredFile } from '../services/storageService.js'
import { ragClient } from '../services/ragClient.js'
import { rateLimit } from '../middleware/rateLimit.js'

export const documentRouter = express.Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: cfg.maxFileSize },
})

/**
 * Insert document and chunks into Postgres in one transaction.
 *
 * @param {object} args
 * @param {string} args.workspaceId
 * @param {string} args.userId
 * @param {string} args.storedFilename
 * @param {string} args.originalName
 * @param {string} args.mimeType
 * @param {number} args.fileSize
 * @param {string} args.filePath
 * @param {number | null} args.pageCount
 * @param {Array<{ text: string, chunkIndex: number, charStart: number, charEnd: number, tokenCount: number }>} args.chunks
 * @returns {Promise<string>}
 */
async function createDocumentAndChunks(args) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const docId = uuidv4()
    await client.query(
      `INSERT INTO documents (
        id, workspace_id, filename, original_name, mime_type,
        file_size, file_path, page_count, status, uploaded_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'processing',$9)`,
      [
        docId,
        args.workspaceId,
        args.storedFilename,
        args.originalName,
        args.mimeType,
        args.fileSize,
        args.filePath,
        args.pageCount,
        args.userId,
      ]
    )

    for (const chunk of args.chunks) {
      await client.query(
        `INSERT INTO document_chunks (
          id, document_id, workspace_id, chunk_index, text,
          char_start, char_end, token_count
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          uuidv4(),
          docId,
          args.workspaceId,
          chunk.chunkIndex,
          chunk.text,
          chunk.charStart,
          chunk.charEnd,
          chunk.tokenCount,
        ]
      )
    }

    await client.query('COMMIT')
    return docId
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

documentRouter.use(authenticate)

/**
 * Upload and process document for a workspace.
 */
documentRouter.post(
  '/workspaces/:workspaceId/documents',
  rateLimit({ windowMs: 60_000, maxRequests: 10 }),
  requireWorkspaceRole('editor'),
  upload.single('file'),
  async (req, res, next) => {
    let storedPath = null

    try {
      const { safeFilename } = validateFile(req.file)
      const saved = await saveUploadedFile(req.workspaceId, safeFilename, req.file.buffer)
      storedPath = saved.path

      const extracted = await extractText(saved.path, req.file.mimetype)
      const chunks = chunkText(extracted.text, cfg.chunkSize, cfg.chunkOverlap)

      const documentId = await createDocumentAndChunks({
        workspaceId: req.workspaceId,
        userId: req.user.id,
        storedFilename: saved.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        filePath: saved.path,
        pageCount: extracted.pageCount,
        chunks,
      })

      await ragClient.embedChunks(
        documentId,
        chunks.map((c) => ({
          chunk_id: `${documentId}_${c.chunkIndex}`,
          chunk_index: c.chunkIndex,
          text: c.text,
          char_start: c.charStart,
          char_end: c.charEnd,
        })),
        req.workspaceId
      )

      await pool.query('UPDATE documents SET status = $1 WHERE id = $2', ['ready', documentId])

      res.status(202).json({ documentId, status: 'processing' })
    } catch (err) {
      if (storedPath) {
        await deleteStoredFile(storedPath)
      }
      next(err)
    }
  }
)

/**
 * List workspace documents with aggregate chunk counts.
 */
documentRouter.get('/workspaces/:workspaceId/documents', requireWorkspaceRole('viewer'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.original_name, d.status, d.page_count, d.created_at,
              COUNT(dc.id)::int AS chunk_count
       FROM documents d
       LEFT JOIN document_chunks dc ON dc.document_id = d.id
       WHERE d.workspace_id = $1
       GROUP BY d.id
       ORDER BY d.created_at DESC`,
      [req.workspaceId]
    )
    res.json({ documents: rows })
  } catch (err) {
    next(err)
  }
})

/**
 * Return processing status for a document.
 */
documentRouter.get('/workspaces/:workspaceId/documents/:docId/status', requireWorkspaceRole('viewer'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, status, error_message FROM documents WHERE id = $1 AND workspace_id = $2',
      [req.params.docId, req.workspaceId]
    )

    if (!rows[0]) return res.status(404).json({ error: 'Document not found' })
    res.json(rows[0])
  } catch (err) {
    next(err)
  }
})

/**
 * Delete a workspace document from DB, RAG vectors, and local storage.
 */
documentRouter.delete('/workspaces/:workspaceId/documents/:docId', requireWorkspaceRole('editor'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, file_path FROM documents WHERE id = $1 AND workspace_id = $2',
      [req.params.docId, req.workspaceId]
    )

    if (!rows[0]) return res.status(404).json({ error: 'Document not found' })

    await pool.query('DELETE FROM documents WHERE id = $1 AND workspace_id = $2', [
      req.params.docId,
      req.workspaceId,
    ])

    await ragClient.deleteDocumentVectors(req.params.docId)
    await deleteStoredFile(rows[0].file_path)

    res.json({ deleted: true })
  } catch (err) {
    next(err)
  }
})
