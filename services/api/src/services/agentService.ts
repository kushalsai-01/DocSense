import axios, { AxiosResponse } from 'axios'
import cfg from '../lib/config'
import { AgentQueryResponse } from '../types'

const client = axios.create({
  baseURL: cfg.agentServiceUrl,
  timeout: cfg.serviceTimeout,
  headers: { 'Content-Type': 'application/json' },
})

export const agentService = {
  async query(
    query: string,
    options: {
      workspaceId?: string
      sessionId?: string
      userId?: string
      includeTrace?: boolean
      includeSuggestions?: boolean
    } = {}
  ): Promise<AgentQueryResponse> {
    const { data } = await client.post('/agent/query', {
      query,
      workspace_id: options.workspaceId,
      session_id: options.sessionId,
      user_id: options.userId,
      include_trace: options.includeTrace ?? true,
      include_suggestions: options.includeSuggestions ?? true,
    })
    return data
  },

  async processDocument(
    documentId: string,
    fullText: string,
    chunks: string[]
  ): Promise<void> {
    await client.post(
      '/agent/documents/process',
      { document_id: documentId, full_text: fullText, chunks },
      { timeout: 120_000 }
    )
  },

  async streamQuery(
    query: string,
    options: {
      workspaceId?: string
      sessionId?: string
      userId?: string
    } = {}
  ): Promise<AxiosResponse> {
    return client.post(
      '/agent/query/stream',
      {
        query,
        workspace_id: options.workspaceId,
        session_id: options.sessionId,
        user_id: options.userId,
      },
      { responseType: 'stream' }
    )
  },

  async isHealthy(): Promise<boolean> {
    try {
      const { status } = await client.get('/agent/health', { timeout: 5000 })
      return status === 200
    } catch {
      return false
    }
  },
}
