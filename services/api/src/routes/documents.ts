import { Router, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { pool, withTransaction } from '../models/db'
import { authenticate } from '../middleware/auth'
import { requireWorkspaceRole } from '../middleware/rbac'
import { upload } from '../middleware/upload'
import {
  validateFile,
  extractText,
  chunkText,
  saveUploadedFile,
  deleteStoredFile,
} from '../services/fileProcessor'
import { ragService } from '../services/ragService'
import { agentService } from '../services/agentService'
import { AuthRequest } from '../types'
import { logger } from '../lib/logger'

export const documentRouter = Router()

documentRouter.use(authenticate)

documentRouter.post(
  '/workspaces/:workspaceId/documents',
  requireWorkspaceRole('editor'),
  upload.single('file'),
  async (req: Request, res: Response) => {
    let storedPath: string | null = null

    try {
      const { safeFilename } = validateFile(req.file)
      const authReq = req as AuthRequest

      const saved = await saveUploadedFile(
        authReq.workspaceId,
        safeFilename,
        req.file!.buffer
      )
      storedPath = saved.path

      const extracted = await extractText(saved.path, req.file!.mimetype)
      const chunks = chunkText(extracted.text)

      const documentId = await withTransaction(async (client) => {
        const docId = uuidv4()
        await client.query(
          `INSERT INTO documents (
            id, workspace_id, filename, original_name, mime_type,
            file_size, file_path, page_count, status, uploaded_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'processing',$9)`,
          [
            docId,
            authReq.workspaceId,
            saved.filename,
            req.file!.originalname,
            req.file!.mimetype,
            req.file!.size,
            saved.path,
            extracted.pageCount,
            authReq.user.id,
          ]
        )

        for (const chunk of chunks) {
          await client.query(
            `INSERT INTO document_chunks (
              id, document_id, workspace_id, chunk_index, text,
              char_start, char_end, token_count
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              uuidv4(),
              docId,
              authReq.workspaceId,
              chunk.chunkIndex,
              chunk.text,
              chunk.charStart,
              chunk.charEnd,
              chunk.tokenCount,
            ]
          )
        }

        return docId
      })

      await ragService.embedChunks(
        documentId,
        chunks.map((c) => ({
          chunk_id: `${documentId}_${c.chunkIndex}`,
          chunk_index: c.chunkIndex,
          text: c.text,
          char_start: c.charStart,
          char_end: c.charEnd,
        })),
        authReq.workspaceId
      )

      await pool.query('UPDATE documents SET status = $1 WHERE id = $2', [
        'ready',
        documentId,
      ])

      // Kick off async document intelligence enrichment (fire-and-forget)
      agentService
        .processDocument(
          documentId,
          extracted.text,
          chunks.map((c) => c.text)
        )
        .catch((err) =>
          logger.warn('document_intelligence_failed', {
            documentId,
            error: String(err),
          })
        )

      logger.info('document_uploaded', {
        documentId,
        workspaceId: authReq.workspaceId,
        filename: req.file!.originalname,
        chunks: chunks.length,
      })

      res.status(202).json({
        documentId,
        status: 'processing',
        chunkCount: chunks.length,
      })
    } catch (err) {
      if (storedPath) await deleteStoredFile(storedPath)
      throw err
    }
  }
)

documentRouter.get(
  '/workspaces/:workspaceId/documents',
  requireWorkspaceRole('viewer'),
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest
    const status = req.query.status as string | undefined
    const page = parseInt((req.query.page as string) || '1', 10)
    const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 100)
    const offset = (page - 1) * limit

    const statusFilter = status ? 'AND d.status = $3' : ''
    const params: unknown[] = [authReq.workspaceId, limit]
    if (status) params.push(status)
    params.push(offset)

    const { rows } = await pool.query(
      `SELECT d.id, d.original_name, d.status, d.page_count, d.created_at,
              d.file_size, d.mime_type,
              COUNT(dc.id)::int AS chunk_count,
              dm.summary, dm.topics, dm.document_type, dm.entities
       FROM documents d
       LEFT JOIN document_chunks dc ON dc.document_id = d.id
       LEFT JOIN document_metadata dm ON dm.document_id = d.id
       WHERE d.workspace_id = $1 ${statusFilter}
       GROUP BY d.id, dm.id
       ORDER BY d.created_at DESC
       LIMIT $2 OFFSET $${params.length}`,
      params
    )

    res.json({ documents: rows, page, limit })
  }
)

documentRouter.get(
  '/workspaces/:workspaceId/documents/:docId',
  requireWorkspaceRole('viewer'),
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest
    const { rows } = await pool.query(
      `SELECT d.*, dm.summary, dm.topics, dm.entities, dm.key_insights,
              dm.document_type, dm.processed_at,
              COUNT(dc.id)::int as chunk_count
       FROM documents d
       LEFT JOIN document_chunks dc ON dc.document_id = d.id
       LEFT JOIN document_metadata dm ON dm.document_id = d.id
       WHERE d.id = $1 AND d.workspace_id = $2
       GROUP BY d.id, dm.id`,
      [req.params.docId, authReq.workspaceId]
    )

    if (!rows[0]) {
      res.status(404).json({ error: 'Document not found' })
      return
    }
    res.json(rows[0])
  }
)

documentRouter.get(
  '/workspaces/:workspaceId/documents/:docId/status',
  requireWorkspaceRole('viewer'),
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest
    const { rows } = await pool.query(
      'SELECT id, status, error_message, page_count FROM documents WHERE id = $1 AND workspace_id = $2',
      [req.params.docId, authReq.workspaceId]
    )

    if (!rows[0]) {
      res.status(404).json({ error: 'Document not found' })
      return
    }
    res.json(rows[0])
  }
)

documentRouter.delete(
  '/workspaces/:workspaceId/documents/:docId',
  requireWorkspaceRole('editor'),
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest
    const { rows } = await pool.query(
      'SELECT id, file_path FROM documents WHERE id = $1 AND workspace_id = $2',
      [req.params.docId, authReq.workspaceId]
    )

    if (!rows[0]) {
      res.status(404).json({ error: 'Document not found' })
      return
    }

    await pool.query('DELETE FROM documents WHERE id = $1', [req.params.docId])
    await ragService.deleteDocumentVectors(req.params.docId)
    if (rows[0].file_path) await deleteStoredFile(rows[0].file_path)

    res.json({ deleted: true })
  }
)

// ── Bulk delete all user documents ───────────────────────────────────
documentRouter.delete(
  '/documents/all',
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest
    const { rows } = await pool.query<{ id: string; file_path: string | null }>(
      'SELECT id, file_path FROM documents WHERE user_id = $1',
      [authReq.user.id]
    )

    for (const row of rows) {
      try {
        await ragService.deleteDocumentVectors(row.id)
      } catch {
        // Best-effort — don't block deletion if vectors already gone
      }
      if (row.file_path) {
        await deleteStoredFile(row.file_path).catch(() => {})
      }
    }

    await pool.query('DELETE FROM documents WHERE user_id = $1', [authReq.user.id])
    logger.info('bulk_documents_deleted', { userId: authReq.user.id, count: rows.length })
    res.json({ deleted: rows.length })
  }
)

// ── Document chunks (paginated) ──────────────────────────────────────
documentRouter.get(
  '/workspaces/:workspaceId/documents/:docId/chunks',
  requireWorkspaceRole('viewer'),
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10))
    const limit = Math.min(50, parseInt((req.query.limit as string) || '10', 10))
    const offset = (page - 1) * limit

    const { rows: countRows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text FROM document_chunks dc
       JOIN documents d ON d.id = dc.document_id
       WHERE dc.document_id = $1 AND d.workspace_id = $2`,
      [req.params.docId, authReq.workspaceId]
    )
    const total = parseInt(countRows[0]?.count ?? '0', 10)

    const { rows } = await pool.query(
      `SELECT dc.id, dc.chunk_index, dc.text AS content, dc.token_count
       FROM document_chunks dc
       JOIN documents d ON d.id = dc.document_id
       WHERE dc.document_id = $1 AND d.workspace_id = $2
       ORDER BY dc.chunk_index ASC
       LIMIT $3 OFFSET $4`,
      [req.params.docId, authReq.workspaceId, limit, offset]
    )

    res.json({
      chunks: rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  }
)

// ── Conversations that cited a document ───────────────────────────────
documentRouter.get(
  '/workspaces/:workspaceId/documents/:docId/conversations',
  requireWorkspaceRole('viewer'),
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest

    const { rows } = await pool.query(
      `SELECT DISTINCT
         c.session_id,
         c.title,
         c.created_at,
         c.updated_at,
         (SELECT content FROM messages
          WHERE session_id = c.session_id AND role = 'user'
          ORDER BY created_at ASC LIMIT 1) AS first_message,
         (SELECT COUNT(*) FROM messages WHERE session_id = c.session_id)::int AS message_count
       FROM conversations c
       JOIN messages m ON m.session_id = c.session_id
       WHERE c.workspace_id = $1
         AND m.citations::text LIKE $2
       ORDER BY c.updated_at DESC
       LIMIT 50`,
      [authReq.workspaceId, `%${req.params.docId}%`]
    )

    res.json(rows)
  }
)

// ── Query route (non-streaming + streaming) ───────────────────────────

const querySchema = z.object({
  query: z.string().min(3).max(1000),
  mode: z.enum(['rag', 'agent']).default('rag'),
  session_id: z.string().min(1).max(255).optional(),
  collection_id: z.string().uuid().optional(),
  stream: z.boolean().default(false),
})

documentRouter.post(
  '/workspaces/:workspaceId/query',
  requireWorkspaceRole('viewer'),
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest
    const body = querySchema.parse(req.body)
    const query = body.query.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim()
    const startedAt = Date.now()

    let documentIds: string[] = []
    if (body.collection_id) {
      const { rows } = await pool.query<{ document_id: string }>(
        `SELECT cd.document_id::text FROM collection_documents cd
         JOIN collections c ON c.id = cd.collection_id
         WHERE c.workspace_id = $1 AND c.id = $2`,
        [authReq.workspaceId, body.collection_id]
      )
      documentIds = rows.map((r) => r.document_id)
    }

    // SSE streaming path
    if (body.stream) {
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')
      res.flushHeaders()

      const sendEvent = (event: string, data: object) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      }

      try {
        const upstream = await agentService.streamQuery(query, {
          workspaceId: authReq.workspaceId,
          sessionId: body.session_id,
          userId: authReq.user.id,
        })

        upstream.data.on('data', (chunk: Buffer) => {
          res.write(chunk.toString())
        })

        upstream.data.on('end', () => {
          sendEvent('done', { status: 'complete' })
          res.end()
        })

        upstream.data.on('error', () => {
          sendEvent('error', { message: 'Stream interrupted' })
          res.end()
        })

        req.on('close', () => {
          upstream.data.destroy()
        })
      } catch {
        // Graceful degradation to RAG
        try {
          const ragResponse = await ragService.query(query, {
            workspaceId: authReq.workspaceId,
            sessionId: body.session_id,
            documentIds,
          })
          sendEvent('answer', {
            content: ragResponse.answer,
            citations: ragResponse.citations,
          })
          sendEvent('done', { status: 'complete', degraded: true })
        } catch (fallbackErr) {
          sendEvent('error', { message: 'Service unavailable' })
        }
        res.end()
      }
      return
    }

    // Non-streaming path
    let response
    let modeUsed = body.mode

    if (body.mode === 'rag') {
      response = await ragService.query(query, {
        workspaceId: authReq.workspaceId,
        sessionId: body.session_id,
        documentIds,
      })
    } else {
      try {
        response = await agentService.query(query, {
          workspaceId: authReq.workspaceId,
          sessionId: body.session_id,
          userId: authReq.user.id,
          includeTrace: true,
        })
      } catch {
        modeUsed = 'rag'
        response = await ragService.query(query, {
          workspaceId: authReq.workspaceId,
          sessionId: body.session_id,
          documentIds,
        })
      }
    }

    const citations = Array.isArray(response?.citations) ? response.citations : []

    await pool.query(
      `INSERT INTO query_analytics (
         user_id, workspace_id, query, mode, mode_used,
         response_time_ms, citation_count, citations_count,
         document_ids, citations, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
      [
        authReq.user.id,
        authReq.workspaceId,
        query,
        modeUsed,
        modeUsed,
        Date.now() - startedAt,
        citations.length,
        citations.length,
        documentIds,
        JSON.stringify(citations),
        'success',
      ]
    ).catch((err) => logger.warn('analytics_insert_failed', { error: String(err) }))

    res.json({ ...response, mode: modeUsed })
  }
)

// ── Similar queries proxy to RAG service ─────────────────────────────
documentRouter.get(
  '/workspaces/:workspaceId/similar-queries',
  requireWorkspaceRole('viewer'),
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest
    const q = String(req.query.q ?? '').trim()
    const limit = Math.min(10, parseInt(String(req.query.limit ?? '5'), 10))

    if (!q) {
      res.json({ results: [] })
      return
    }

    const results = await ragService.getSimilarQueries(q, authReq.workspaceId, limit)
    res.json({ results })
  }
)

// SSE streaming via GET (legacy EventSource compatibility)
documentRouter.get(
  '/workspaces/:workspaceId/query/stream',
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest
    const q = String(req.query.q || '').trim()
    if (q.length < 3) {
      res.status(400).json({ error: 'Query too short' })
      return
    }

    const mode = req.query.mode === 'agent' ? 'agent' : 'rag'
    const sessionId = req.query.session_id ? String(req.query.session_id) : undefined

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    const sendEvent = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    try {
      if (mode === 'agent') {
        const upstream = await agentService.streamQuery(q, {
          workspaceId: req.params.workspaceId,
          sessionId,
          userId: authReq.user?.id,
        })

        upstream.data.on('data', (chunk: Buffer) => {
          res.write(chunk.toString())
        })
        upstream.data.on('end', () => {
          sendEvent('done', {})
          res.end()
        })
        upstream.data.on('error', () => {
          sendEvent('error', { message: 'Stream error' })
          res.end()
        })
      } else {
        const result = await ragService.query(q, {
          workspaceId: req.params.workspaceId,
          sessionId,
        })
        const words = (result.answer || '').split(/\s+/)
        for (const word of words) {
          sendEvent('token', { token: word + ' ' })
        }
        sendEvent('citations', { citations: result.citations || [] })
        sendEvent('done', {})
        res.end()
      }
    } catch {
      sendEvent('error', { message: 'Service unavailable' })
      res.end()
    }
  }
)
