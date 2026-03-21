import axios from 'axios'
import cfg from '../lib/config'
import { logger } from '../lib/logger'
import { RagQueryResponse } from '../types'

const client = axios.create({
  baseURL: cfg.ragServiceUrl,
  timeout: cfg.serviceTimeout,
  headers: { 'Content-Type': 'application/json' },
})

export const ragService = {
  async embedChunks(
    documentId: string,
    chunks: Array<{
      chunk_id: string
      chunk_index: number
      text: string
      char_start?: number
      char_end?: number
    }>,
    workspaceId?: string
  ): Promise<{ upserted: number; bm25_indexed: number }> {
    const { data } = await client.post('/embed', {
      document_id: documentId,
      chunks,
      workspace_id: workspaceId,
    })
    return data
  },

  async query(
    query: string,
    options: {
      workspaceId?: string
      topK?: number
      sessionId?: string
      documentIds?: string[]
      includeSuggestions?: boolean
    } = {}
  ): Promise<RagQueryResponse> {
    const { data } = await client.post('/query', {
      query,
      top_k: options.topK ?? 5,
      workspace_id: options.workspaceId,
      session_id: options.sessionId,
      doc_filter: options.documentIds,
      filter_by_doc_ids: options.documentIds,
      include_suggestions: options.includeSuggestions ?? true,
    })
    return data
  },

  async queryChunks(
    query: string,
    workspaceId: string,
    topK = 10
  ): Promise<{ chunks: unknown[]; retrieval_method: string }> {
    const { data } = await client.post('/query-chunks', {
      query,
      workspace_id: workspaceId,
      top_k: topK,
    })
    return data
  },

  async deleteDocumentVectors(documentId: string): Promise<void> {
    await client.delete(`/documents/${documentId}/vectors`)
  },

  async storeQueryHistory(
    question: string,
    answer: string,
    workspaceId: string,
    sessionId?: string
  ): Promise<void> {
    try {
      await client.post('/query-history', {
        question,
        answer,
        workspace_id: workspaceId,
        session_id: sessionId,
      })
    } catch (err) {
      logger.warn('query_history_store_failed', { error: String(err) })
    }
  },

  async getSimilarQueries(
    query: string,
    workspaceId: string,
    topK = 5
  ): Promise<Array<{ question: string; answer: string; similarity: number }>> {
    try {
      const { data } = await client.get('/similar-queries', {
        params: { q: query, workspace_id: workspaceId, top_k: topK },
      })
      return data.results ?? []
    } catch {
      return []
    }
  },

  async isHealthy(): Promise<boolean> {
    try {
      const { status } = await client.get('/health', { timeout: 5000 })
      return status === 200
    } catch {
      return false
    }
  },
}
