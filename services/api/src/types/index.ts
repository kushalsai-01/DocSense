import { Request } from 'express'

export interface AuthUser {
  id: string
  email: string
  name: string
}

export interface AuthRequest extends Request {
  user: AuthUser
  workspaceId: string
  workspaceRole: string
}

export interface JwtPayload {
  userId: string
  email: string
  type?: string
  tokenId?: string
}

export interface DocumentRow {
  id: string
  workspace_id: string
  filename: string
  original_name: string
  mime_type: string
  file_size: number
  file_path: string
  page_count: number | null
  status: 'pending' | 'processing' | 'ready' | 'failed'
  error_message: string | null
  uploaded_by: string
  created_at: Date
  updated_at: Date
  chunk_count?: number
  summary?: string | null
  topics?: string[] | null
  entities?: Record<string, string[]> | null
  key_insights?: string[] | null
  document_type?: string | null
}

export interface ChunkRow {
  id: string
  document_id: string
  workspace_id: string
  chunk_index: number
  text: string
  char_start: number
  char_end: number
  token_count: number
}

export interface ConversationRow {
  id: string
  session_id: string
  user_id: string
  created_at: Date
}

export interface MessageRow {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  citations: Citation[]
  metadata: Record<string, unknown>
  created_at: Date
}

export interface Citation {
  chunk_id: string
  document_id: string
  doc_name?: string
  chunk_index?: number
  text_snippet?: string
  page_num?: number
  char_start?: number
  char_end?: number
  reranker_score?: number
}

export interface QueryAnalyticsRow {
  id: string
  user_id: string
  workspace_id: string
  query: string
  mode: string
  mode_used: string
  response_time_ms: number
  citation_count: number
  citations_count: number
  document_ids: string[]
  citations: Citation[]
  status: string
  ragas_scores?: RagasScores | null
  created_at: Date
}

export interface RagasScores {
  faithfulness: number
  answer_relevancy: number
  context_recall: number
  context_precision: number
  overall: number
}

export interface RagQueryResponse {
  answer: string
  citations: Citation[]
  matches?: unknown[]
  suggestions?: string[]
  agent_trace?: string[]
  retrieval_method?: string
  conversation_summary?: unknown
  mode?: string
}

export interface AgentQueryResponse {
  answer: string
  citations: Citation[]
  suggestions?: string[]
  strategy?: string
  agent_trace?: AgentStep[]
  conversation_summary?: unknown
  total_duration_ms?: number
  status?: string
}

export interface AgentStep {
  step: number
  phase: string
  content: string
  duration_ms: number
}

export interface DocumentIntelligence {
  document_id: string
  summary: string
  topics: string[]
  entities: Record<string, string[]>
  key_insights: string[]
  document_type: string
  processed_at: string
}

export interface WorkspaceRow {
  id: string
  name: string
  slug: string
  owner_id: string
  qdrant_namespace: string
  created_at: Date
  updated_at: Date
  role?: string
}

export interface AppError extends Error {
  statusCode?: number
  code?: string
}
