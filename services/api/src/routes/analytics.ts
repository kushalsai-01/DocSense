import { Router, Request, Response } from 'express'
import axios from 'axios'
import { pool } from '../models/db'
import { authenticate } from '../middleware/auth'
import { requireWorkspaceRole } from '../middleware/rbac'
import { AuthRequest } from '../types'
import cfg from '../lib/config'

export const analyticsRouter = Router()

analyticsRouter.use(authenticate)

// ── Storage stats for Settings page ──────────────────────────────────
analyticsRouter.get('/analytics/storage', async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const userId = authReq.user.id

  const [docResult, chunkResult, convResult, queryResult] = await Promise.all([
    pool.query<{ count: string }>(
      'SELECT COUNT(*)::text FROM documents WHERE user_id = $1',
      [userId]
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(dc.*)::text
       FROM document_chunks dc
       JOIN documents d ON d.id = dc.document_id
       WHERE d.user_id = $1`,
      [userId]
    ),
    pool.query<{ count: string }>(
      'SELECT COUNT(*)::text FROM conversations WHERE user_id = $1',
      [userId]
    ),
    pool.query<{ count: string; avg: string }>(
      'SELECT COUNT(*)::text, AVG(quality_score)::text FROM query_analytics WHERE user_id = $1',
      [userId]
    ),
  ])

  let qdrantVectors: number | null = null
  try {
    const ragHealth = await axios.get<{ collection_stats?: { vectors_count?: number } }>(
      `${cfg.ragServiceUrl}/health`,
      { timeout: 2000 }
    )
    qdrantVectors = ragHealth.data?.collection_stats?.vectors_count ?? null
  } catch {
    // RAG service unavailable — omit vector count
  }

  res.json({
    documents: parseInt(docResult.rows[0]?.count ?? '0', 10),
    chunks: parseInt(chunkResult.rows[0]?.count ?? '0', 10),
    conversations: parseInt(convResult.rows[0]?.count ?? '0', 10),
    totalQueries: parseInt(queryResult.rows[0]?.count ?? '0', 10),
    avgQualityScore: queryResult.rows[0]?.avg ? parseFloat(queryResult.rows[0].avg) : null,
    qdrantVectors,
  })
})

analyticsRouter.get(
  '/workspaces/:workspaceId/analytics',
  requireWorkspaceRole('viewer'),
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest
    const workspaceId = authReq.workspaceId

    const [summary, topDocs, queriesOverTime, ragasMetrics] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int as total_queries,
           COALESCE(AVG(response_time_ms), 0)::int as avg_response_time_ms,
           COUNT(*) FILTER (WHERE mode_used = 'rag')::int as rag_count,
           COUNT(*) FILTER (WHERE mode_used = 'agent')::int as agent_count,
           COALESCE(AVG((ragas_scores->>'overall')::float), 0) as avg_quality_score
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
         LIMIT 10`,
        [workspaceId]
      ),
      pool.query(
        `SELECT
           DATE_TRUNC('day', created_at) as date,
           COUNT(*)::int as count
         FROM query_analytics
         WHERE workspace_id = $1 AND created_at > NOW() - INTERVAL '30 days'
         GROUP BY date
         ORDER BY date`,
        [workspaceId]
      ),
      pool.query(
        `SELECT
           COALESCE(AVG((ragas_scores->>'faithfulness')::float), 0) as faithfulness,
           COALESCE(AVG((ragas_scores->>'answer_relevancy')::float), 0) as answer_relevancy,
           COALESCE(AVG((ragas_scores->>'context_recall')::float), 0) as context_recall,
           COALESCE(AVG((ragas_scores->>'context_precision')::float), 0) as context_precision
         FROM query_analytics
         WHERE workspace_id = $1 AND ragas_scores IS NOT NULL
           AND created_at > NOW() - INTERVAL '30 days'`,
        [workspaceId]
      ),
    ])

    res.json({
      workspace_id: workspaceId,
      summary: summary.rows[0],
      top_documents: topDocs.rows,
      queries_over_time: queriesOverTime.rows,
      ragas_metrics: ragasMetrics.rows[0],
    })
  }
)

analyticsRouter.get(
  '/workspaces/:workspaceId/analytics/documents/:docId',
  requireWorkspaceRole('viewer'),
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest
    const { docId } = req.params
    const workspaceId = authReq.workspaceId

    const [citedCount, pages, reranker] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total_times_cited
         FROM query_analytics
         WHERE workspace_id = $1 AND $2::uuid = ANY(document_ids)`,
        [workspaceId, docId]
      ),
      pool.query(
        `SELECT
           (c->>'page_num')::int AS page_num,
           COUNT(*)::int AS cite_count
         FROM query_analytics qa
         CROSS JOIN LATERAL jsonb_array_elements(COALESCE(citations,'[]'::jsonb)) c
         WHERE qa.workspace_id = $1
           AND COALESCE(c->>'doc_id', c->>'document_id') = $2
           AND c ? 'page_num'
         GROUP BY page_num ORDER BY cite_count DESC LIMIT 10`,
        [workspaceId, docId]
      ),
      pool.query(
        `SELECT COALESCE(AVG((c->>'reranker_score')::float), 0) AS avg_reranker_score
         FROM query_analytics qa
         CROSS JOIN LATERAL jsonb_array_elements(COALESCE(citations,'[]'::jsonb)) c
         WHERE qa.workspace_id = $1
           AND COALESCE(c->>'doc_id', c->>'document_id') = $2
           AND c ? 'reranker_score'`,
        [workspaceId, docId]
      ),
    ])

    res.json({
      workspace_id: workspaceId,
      document_id: docId,
      total_times_cited: citedCount.rows[0]?.total_times_cited || 0,
      most_cited_pages: pages.rows,
      avg_reranker_score: Number(reranker.rows[0]?.avg_reranker_score || 0),
    })
  }
)
