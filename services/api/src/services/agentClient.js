/**
 * HTTP client for the Agent Python service.
 *
 * WHY separate from ragClient?
 * The Agent and RAG services run on different ports (8100 vs 8000),
 * have different timeout needs (agent is slower — LangGraph pipeline
 * involves multiple LLM calls), and return different response shapes.
 *
 * @module services/agentClient
 */

import axios from 'axios'
import cfg from '../config.js'

const client = axios.create({
  baseURL: cfg.agentServiceUrl,
  // WHY longer timeout?  The agent pipeline runs 5 LLM calls (query_analyzer,
  // grading per chunk, generator, hallucination_checker, suggestions).
  // Each takes 1-3s, so total can easily hit 30-60s.
  timeout: cfg.serviceTimeout * 2,
  headers: { 'Content-Type': 'application/json' },
})

export const agentClient = {
  /**
   * Run the full LangGraph agent pipeline.
   *
   * @param {string} query - User's question
   * @param {object} options
   * @param {string} [options.workspaceId]
   * @param {string} [options.sessionId]
   * @param {boolean} [options.includeTrace=false]
   * @param {boolean} [options.includeSuggestions=true]
   * @returns {Promise<object>} Agent response with answer, citations, trace
   */
  async query(query, { workspaceId, sessionId, includeTrace = false, includeSuggestions = true } = {}) {
    const { data } = await client.post('/query', {
      query,
      workspace_id: workspaceId,
      session_id: sessionId,
      include_trace: includeTrace,
      include_suggestions: includeSuggestions,
    })
    return data
  },

  /**
   * Get conversation summary by session ID.
   *
   * @param {string} sessionId
   * @returns {Promise<object>}
   */
  async getConversation(sessionId) {
    const { data } = await client.get(`/conversations/${sessionId}`)
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
