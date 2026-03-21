// ── Auth ─────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string
  email: string
  name: string
}

export interface AuthResponse {
  token: string
  refreshToken: string
  user: AuthUser
}

// ── Documents ─────────────────────────────────────────────────────────
export type DocumentStatus = 'processing' | 'ready' | 'error'

export interface DocumentMetadata {
  summary: string | null
  topics: string[]
  entities: {
    people: string[]
    organizations: string[]
    dates: string[]
    locations: string[]
    technical_terms: string[]
  }
  keyInsights: string[]
  documentType: string | null
}

export interface Document {
  id: string
  workspaceId: string
  name: string
  fileType: string
  fileSizeBytes: number
  status: DocumentStatus
  pageCount: number | null
  chunkCount: number | null
  metadata: DocumentMetadata | null
  createdAt: string
  updatedAt: string
}

// ── Query / Chat ─────────────────────────────────────────────────────
export interface Citation {
  docId: string
  docName: string
  chunkId: string
  text: string
  score: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations: Citation[]
  qualityScore: number | null
  createdAt: string
}

export interface Conversation {
  sessionId: string
  workspaceId: string
  title: string | null
  createdAt: string
  updatedAt: string
  lastMessage?: string
}

export interface QueryPayload {
  query: string
  sessionId?: string
  documentIds?: string[]
  enablePlanning?: boolean
  enableEvaluation?: boolean
  stream?: boolean
}

// ── SSE Event types ──────────────────────────────────────────────────
export interface PlanEvent {
  strategy: string
  steps: string[]
}

export interface ThinkingEvent {
  content: string
}

export interface ToolCallEvent {
  tool: string
  input: string
}

export interface ToolResultEvent {
  tool: string
  result: string
}

export interface AnswerCompleteEvent {
  answer: string
  citations: Citation[]
  qualityScore: number
  suggestions: string[]
}

// ── Analytics ─────────────────────────────────────────────────────────
export interface AnalyticsSummary {
  totalDocuments: number
  totalQueries: number
  avgQualityScore: number
  avgResponseTimeMs: number
  queryVolumeByDay: Array<{ date: string; count: number }>
  strategyDistribution: Array<{ strategy: string; count: number }>
  topQueries: Array<{ query: string; count: number }>
  ragasMetrics: {
    faithfulness: number
    answerRelevancy: number
    contextRecall: number
    contextPrecision: number
    count: number
  }
  recentTraces: Array<{
    query: string
    strategy: string
    qualityScore: number
    durationMs: number
    createdAt: string
  }>
}
