/**
 * HTTP client for the RAG Python service.
 *
 * WHY a dedicated client class instead of raw axios calls?
 * Centralising the base URL, timeout, and error handling here means
 * route handlers don't need to worry about HTTP plumbing.  It also
 * makes it trivial to add retry logic, circuit breakers, or request
 * tracing later without touching every call site.
 *
 * @module services/ragClient
 */

import axios from 'axios'
import cfg from '../config.js'

const client = axios.create({
  baseURL: cfg.ragServiceUrl,
  timeout: cfg.serviceTimeout,
  headers: { 'Content-Type': 'application/json' },
})

export const ragClient = {
  /**
   * Embed document chunks into the vector store + BM25 index.
   *
   * @param {string} documentId
   * @param {Array<{chunk_id: string, chunk_index: number, text: string}>} chunks
   * @param {string} [workspaceId]
   * @returns {Promise<{upserted: number, bm25_indexed: number}>}
   */
  async embedChunks(documentId, chunks, workspaceId) {
    const { data } = await client.post('/embed', {
      document_id: documentId,
      chunks,
      workspace_id: workspaceId,
    })
    return data
  },

  /**
   * Full RAG query — retrieves chunks, generates answer, returns citations.
   *
   * @param {string} query
   * @param {object} options
   * @param {string} [options.workspaceId]
   * @param {number} [options.topK=5]
   * @param {string} [options.sessionId]
   * @param {string[]} [options.documentIds]
   * @param {boolean} [options.includesSuggestions=true]
   * @returns {Promise<object>} RAG response with answer, citations, matches
   */
  async query(query, { workspaceId, topK = 5, sessionId, documentIds, includeSuggestions = true } = {}) {
    const { data } = await client.post('/query', {
      query,
      top_k: topK,
      workspace_id: workspaceId,
      session_id: sessionId,
      doc_filter: documentIds,
      filter_by_doc_ids: documentIds,
      include_suggestions: includeSuggestions,
    })
    return data
  },

  /**
   * Raw chunk retrieval (no LLM generation) — used by the agent pipeline.
   *
   * @param {string} query
   * @param {string} workspaceId
   * @param {number} [topK=10]
   * @returns {Promise<{chunks: Array, retrieval_method: string}>}
   */
  async queryChunks(query, workspaceId, topK = 10) {
    const { data } = await client.post('/query-chunks', {
      query,
      workspace_id: workspaceId,
      top_k: topK,
    })
    return data
  },

  /**
   * Delete all vectors for a document.
   *
   * @param {string} documentId
   * @returns {Promise<{deleted: boolean}>}
   */
  async deleteDocumentVectors(documentId) {
    const { data } = await client.delete(`/documents/${documentId}/vectors`)
    return data
  },

  /**
   * Rebuild BM25 index for a workspace.
   *
   * @param {string} workspaceId
   * @returns {Promise<object>}
   */
  async reindex(workspaceId) {
    const { data } = await client.post(`/reindex/${workspaceId}`)
    return data
  },

  /**
   * Health check.
   * @returns {Promise<boolean>}
   */
  async isHealthy() {
    try {
      const { status } = await client.get('/health', { timeout: 5000 })
      return status === 200
    } catch {
      return false
    }
  },
}
