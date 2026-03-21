import express from 'express'
import jwt from 'jsonwebtoken'
import axios from 'axios'
import { z } from 'zod'
import cfg from '../config.js'
import { pool } from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'
import { requireWorkspaceRole } from '../middleware/rbac.js'
import { ragClient } from '../services/ragClient.js'
import { agentClient } from '../services/agentClient.js'
import { rateLimit } from '../middleware/rateLimit.js'

export const queryRouter = express.Router()

const querySchema = z.object({
  query: z.string().min(3).max(1000),
  mode: z.enum(['rag', 'agent']).default('rag'),
  session_id: z.string().min(1).max(255).optional(),
  collection_id: z.string().uuid().optional(),
})

/**
 * Normalize user query text for safer downstream processing.
 *
 * @param {string} query
 * @returns {string}
 */
function sanitizeQuery(query) {
  return query.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * Persist query timing and result metadata.
 *
 * @param {{ userId: string, workspaceId: string, query: string, mode: string, responseTimeMs: number, citationCount: number, documentIds: string[], citations: unknown[], status: string }} input
 * @returns {Promise<void>}
 */
async function recordAnalytics(input) {
  await pool.query(
    `INSERT INTO query_analytics (
       user_id, workspace_id, query, mode, mode_used,
       response_time_ms, citation_count, citations_count,
       document_ids, citations, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
    [
      input.userId,
      input.workspaceId,
      input.query,
      input.mode,
      input.mode,
      input.responseTimeMs,
      input.citationCount,
      input.citationCount,
      input.documentIds,
      JSON.stringify(input.citations || []),
      input.status,
    ]
  )
}

/**
 * Resolve document IDs for a collection in a workspace.
 *
 * @param {string} workspaceId
 * @param {string} collectionId
 * @returns {Promise<string[]>}
 */
async function getCollectionDocumentIds(workspaceId, collectionId) {
  const { rows } = await pool.query(
    `SELECT cd.document_id::text AS document_id
     FROM collection_documents cd
     JOIN collections c ON c.id = cd.collection_id
     WHERE c.workspace_id = $1 AND c.id = $2`,
    [workspaceId, collectionId]
  )
  return rows.map((r) => r.document_id)
}

queryRouter.use(authenticate)

/**
 * Run a workspace query in RAG or Agent mode, with Agent fallback to RAG.
 */
queryRouter.post(
  '/workspaces/:workspaceId/query',
  rateLimit({ windowMs: 60_000, maxRequests: 20 }),
  requireWorkspaceRole('viewer'),
  async (req, res, next) => {
  try {
    const body = querySchema.parse(req.body)
    const query = sanitizeQuery(body.query)
    const startedAt = Date.now()
    const documentIds = body.collection_id
      ? await getCollectionDocumentIds(req.workspaceId, body.collection_id)
      : []

    let response
    let modeUsed = body.mode
    let status = 'success'

    if (body.mode === 'rag') {
      response = await ragClient.query(query, {
        workspaceId: req.workspaceId,
        sessionId: body.session_id,
        documentIds,
      })
    } else {
      try {
        response = await agentClient.query(query, {
          workspaceId: req.workspaceId,
          sessionId: body.session_id,
          includeTrace: true,
        })
      } catch (err) {
        if (axios.isAxiosError(err)) {
          modeUsed = 'rag'
          response = await ragClient.query(query, {
            workspaceId: req.workspaceId,
            sessionId: body.session_id,
            documentIds,
          })
        } else {
          throw err
        }
      }
    }

    const citations = Array.isArray(response?.citations) ? response.citations : []
    const citedDocumentIds = new Set(
      citations
        .map((c) => c?.doc_id || c?.document_id)
        .filter(Boolean)
        .map(String)
    )

    // Keep explicit collection filter IDs and discovered citation IDs.
    for (const id of documentIds) {
      citedDocumentIds.add(String(id))
    }

    await recordAnalytics({
      userId: req.user.id,
      workspaceId: req.workspaceId,
      query,
      mode: modeUsed,
      responseTimeMs: Date.now() - startedAt,
      citationCount: citations.length,
      documentIds: Array.from(citedDocumentIds),
      citations,
      status,
    })

    res.json({ ...response, mode: modeUsed })
  } catch (err) {
    next(err)
  }
  }
)

/**
 * Resolve authenticated user from SSE token query parameter.
 *
 * @param {import('express').Request} req
 * @returns {Promise<{ id: string, email: string }>}
 */
async function resolveUserFromQueryToken(req) {
  const token = String(req.query.token || '')
  if (!token) throw new Error('Missing token')

  const payload = jwt.verify(token, cfg.jwtSecret)
  const { rows } = await pool.query('SELECT id, email FROM users WHERE id = $1', [payload.userId])
  if (!rows[0]) throw new Error('User not found')
  return rows[0]
}

/**
 * Ensure user is at least viewer in workspace.
 *
 * @param {string} workspaceId
 * @param {string} userId
 * @returns {Promise<void>}
 */
async function assertWorkspaceViewer(workspaceId, userId) {
  const { rows } = await pool.query(
    `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId]
  )

  if (!rows[0]) throw new Error('Not a workspace member')
}

/**
 * Stream query results over SSE by proxying Python service stream endpoints.
 */
queryRouter.get('/workspaces/:workspaceId/query/stream', async (req, res, next) => {
  try {
    const user = await resolveUserFromQueryToken(req)
    await assertWorkspaceViewer(req.params.workspaceId, user.id)

    const q = sanitizeQuery(String(req.query.q || ''))
    if (q.length < 3 || q.length > 1000) {
      return res.status(400).json({ error: 'Query length must be 3-1000 chars' })
    }

    const mode = req.query.mode === 'agent' ? 'agent' : 'rag'
    const sessionId = req.query.session_id ? String(req.query.session_id) : undefined

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const baseUrl = mode === 'agent' ? cfg.agentServiceUrl : cfg.ragServiceUrl

    try {
      const upstream = await axios.get(`${baseUrl}/query/stream`, {
        params: {
          q,
          workspace_id: req.params.workspaceId,
          session_id: sessionId,
        },
        responseType: 'stream',
      })

      upstream.data.on('data', (chunk) => {
        res.write(chunk.toString())
      })

      upstream.data.on('end', () => {
        res.write('event: done\\ndata: {}\\n\\n')
        res.end()
      })

      upstream.data.on('error', (err) => {
        next(err)
      })
    } catch {
      const fallback = mode === 'agent'
        ? await agentClient.query(q, { workspaceId: req.params.workspaceId, sessionId })
        : await ragClient.query(q, { workspaceId: req.params.workspaceId, sessionId })

      const text = String(fallback.answer || '')
      for (const token of text.split(/\s+/)) {
        res.write(`event: token\\ndata: ${JSON.stringify({ token })}\\n\\n`)
      }

      res.write(`event: citations\\ndata: ${JSON.stringify(fallback.citations || [])}\\n\\n`)
      res.write('event: done\\ndata: {}\\n\\n')
      res.end()
    }
  } catch (err) {
    next(err)
  }
})
