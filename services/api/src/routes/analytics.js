import express from 'express'
import { pool } from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'
import { requireWorkspaceRole } from '../middleware/rbac.js'

export const analyticsRouter = express.Router()

// All analytics routes require authenticated viewer access to the workspace.
analyticsRouter.use(authenticate)

/**
 * Workspace analytics summary, top docs, and time series.
 */
analyticsRouter.get('/workspaces/:workspaceId/analytics', requireWorkspaceRole('viewer'), async (req, res, next) => {
  try {
    const workspaceId = req.workspaceId

    const [summaryResult, topDocumentsResult, queriesOverTimeResult] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int as total_queries,
           COALESCE(AVG(response_time_ms), 0)::int as avg_response_time_ms,
           COUNT(*) FILTER (WHERE mode_used = 'rag')::int as rag_count,
           COUNT(*) FILTER (WHERE mode_used = 'agent')::int as agent_count
         FROM query_analytics
         WHERE workspace_id = $1`,
        [workspaceId]
      ),
      pool.query(
        `SELECT
           COALESCE(d.original_name, d.filename) as name,
           COUNT(*)::int as query_count
         FROM query_analytics qa
         JOIN documents d ON d.id = ANY(qa.document_ids)
         WHERE qa.workspace_id = $1
         GROUP BY COALESCE(d.original_name, d.filename)
         ORDER BY query_count DESC
         LIMIT 5`,
        [workspaceId]
      ),
      pool.query(
        `SELECT
           DATE_TRUNC('day', created_at) as date,
           COUNT(*)::int as count
         FROM query_analytics
         WHERE workspace_id = $1
           AND created_at > NOW() - INTERVAL '7 days'
         GROUP BY date
         ORDER BY date`,
        [workspaceId]
      ),
    ])

    res.json({
      workspace_id: workspaceId,
      summary: summaryResult.rows[0],
      top_documents: topDocumentsResult.rows,
      queries_over_time: queriesOverTimeResult.rows,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * Per-document analytics from query log citations.
 */
analyticsRouter.get('/workspaces/:workspaceId/analytics/documents/:docId', requireWorkspaceRole('viewer'), async (req, res, next) => {
  try {
    const workspaceId = req.workspaceId
    const docId = req.params.docId

    const [citedCountResult, pagesResult, rerankerResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total_times_cited
         FROM query_analytics qa
         WHERE qa.workspace_id = $1
           AND $2::uuid = ANY(qa.document_ids)`,
        [workspaceId, docId]
      ),
      pool.query(
        `SELECT
           (c->>'page_num')::int AS page_num,
           COUNT(*)::int AS cite_count
         FROM query_analytics qa
         CROSS JOIN LATERAL jsonb_array_elements(COALESCE(qa.citations, '[]'::jsonb)) c
         WHERE qa.workspace_id = $1
           AND COALESCE(c->>'doc_id', c->>'document_id') = $2
           AND c ? 'page_num'
         GROUP BY page_num
         ORDER BY cite_count DESC
         LIMIT 10`,
        [workspaceId, docId]
      ),
      pool.query(
        `SELECT
           COALESCE(AVG((c->>'reranker_score')::float), 0) AS avg_reranker_score
         FROM query_analytics qa
         CROSS JOIN LATERAL jsonb_array_elements(COALESCE(qa.citations, '[]'::jsonb)) c
         WHERE qa.workspace_id = $1
           AND COALESCE(c->>'doc_id', c->>'document_id') = $2
           AND c ? 'reranker_score'`,
        [workspaceId, docId]
      ),
    ])

    res.json({
      workspace_id: workspaceId,
      document_id: docId,
      total_times_cited: citedCountResult.rows[0]?.total_times_cited || 0,
      most_cited_pages: pagesResult.rows,
      avg_reranker_score: Number(rerankerResult.rows[0]?.avg_reranker_score || 0),
    })
  } catch (err) {
    next(err)
  }
})
