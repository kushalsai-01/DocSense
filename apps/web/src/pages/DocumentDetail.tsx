import { useQuery } from '@tanstack/react-query'
import React, { useCallback, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate, useParams } from 'react-router-dom'
import { Skeleton } from '../components/Skeleton'
import { api } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import { streamQuery } from '../services/stream'
import type { AnswerCompleteEvent, Citation, Document, ToolCallEvent, ToolResultEvent } from '../types'

const DEFAULT_WORKSPACE = 'default'
const CHUNKS_PER_PAGE = 10

// ── Tab types ─────────────────────────────────────────────────────────
type Tab = 'overview' | 'chunks' | 'conversations' | 'ask'

// ── Entity grid ───────────────────────────────────────────────────────
function EntitySection({ entities }: { entities: Record<string, string[]> }) {
  const nonEmpty = Object.entries(entities).filter(([, v]) => v?.length > 0)
  if (nonEmpty.length === 0) return null
  return (
    <div>
      <h3 className="mb-3 font-medium text-white">Entities</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {nonEmpty.map(([type, items]) => (
          <div key={type} className="rounded-lg border border-gray-800 bg-gray-900/60 p-3">
            <p className="mb-2 text-xs uppercase tracking-wider text-gray-500">
              {type.replace('_', ' ')}
            </p>
            <div className="space-y-1">
              {(items as string[]).slice(0, 5).map((item) => (
                <p key={item} className="truncate text-sm text-gray-300">{item}</p>
              ))}
              {items.length > 5 && (
                <p className="text-xs text-gray-500">+{items.length - 5} more</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Inline query interface (pre-filtered to one document) ─────────────
interface InlineQueryProps {
  documentId: string
  documentName: string
  workspaceId: string
}

interface LocalMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations: Citation[]
  isStreaming?: boolean
}

function InlineQueryInterface({ documentId, documentName, workspaceId }: InlineQueryProps) {
  const [messages, setMessages] = useState<LocalMsg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  async function send() {
    const q = input.trim()
    if (!q || loading) return
    setInput('')
    setLoading(true)

    const userId = `user-${Date.now()}`
    const assistantId = `asst-${Date.now()}`

    setMessages((prev) => [
      ...prev,
      { id: userId, role: 'user', content: q, citations: [] },
      { id: assistantId, role: 'assistant', content: '', citations: [], isStreaming: true },
    ])
    scrollToBottom()

    abortRef.current = new AbortController()

    try {
      await streamQuery(
        workspaceId,
        { query: q, documentIds: [documentId], stream: true },
        {
          onAnswerChunk: (chunk) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + chunk } : m
              )
            )
          },
          onAnswerComplete: (complete: AnswerCompleteEvent) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: complete.answer || m.content, citations: complete.citations ?? [], isStreaming: false }
                  : m
              )
            )
            scrollToBottom()
          },
          onToolCall: (_t: ToolCallEvent) => {},
          onToolResult: (_r: ToolResultEvent) => {},
          onError: (err) => {
            toast.error(err)
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, isStreaming: false } : m
              )
            )
          },
          onDone: () => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, isStreaming: false } : m
              )
            )
            setLoading(false)
          },
        },
        abortRef.current.signal,
      )
    } catch (e: unknown) {
      if ((e as { name?: string })?.name !== 'AbortError') {
        toast.error('Stream interrupted')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-400">
        Asking about: <span className="text-indigo-300">{documentName}</span>
      </p>

      <div className="min-h-[200px] space-y-4">
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500">
            Ask a question — answers will be scoped to this document only.
          </p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'user' ? (
              <div className="max-w-[70%] rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-2.5 text-sm text-white">
                {msg.content}
              </div>
            ) : (
              <div className="max-w-[85%] space-y-2">
                <div className="rounded-2xl rounded-tl-sm border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-100">
                  {msg.content}
                  {msg.isStreaming && (
                    <span className="ml-0.5 inline-block h-4 w-1 animate-pulse bg-indigo-400" />
                  )}
                </div>
                {msg.citations.length > 0 && (
                  <p className="text-xs text-gray-500">{msg.citations.length} sources cited</p>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder={`Ask about ${documentName}…`}
          className="flex-1 rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading}
          className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          {loading ? '…' : 'Ask'}
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────
export default function DocumentDetailPage() {
  const { docId } = useParams<{ docId: string }>()
  const navigate = useNavigate()
  const workspaceId = DEFAULT_WORKSPACE
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [chunksPage, setChunksPage] = useState(1)

  const { data: doc, isLoading: docLoading } = useQuery<Document & {
    summary?: string
    topics?: string[]
    entities?: Record<string, string[]>
    keyInsights?: string[]
    documentType?: string
  }>({
    queryKey: queryKeys.documents.detail(docId!),
    queryFn: async () => {
      const { data } = await api.get(
        `/workspaces/${workspaceId}/documents/${docId}`
      )
      return data
    },
    enabled: !!docId,
  })

  const { data: chunksData } = useQuery<{
    chunks: Array<{ id: string; chunk_index: number; content: string; token_count: number | null }>
    total: number
    totalPages: number
  }>({
    queryKey: queryKeys.documents.chunks(docId!, chunksPage),
    queryFn: async () => {
      const { data } = await api.get(
        `/workspaces/${workspaceId}/documents/${docId}/chunks?page=${chunksPage}&limit=${CHUNKS_PER_PAGE}`
      )
      return data
    },
    enabled: !!docId && activeTab === 'chunks',
  })

  const { data: conversations = [] } = useQuery<Array<{
    session_id: string
    title: string | null
    first_message: string | null
    message_count: number
    updated_at: string
  }>>({
    queryKey: queryKeys.documents.conversations(docId!),
    queryFn: async () => {
      const { data } = await api.get(
        `/workspaces/${workspaceId}/documents/${docId}/conversations`
      )
      return data
    },
    enabled: !!docId && activeTab === 'conversations',
  })

  if (docLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400">Document not found</p>
          <button
            onClick={() => navigate('/documents')}
            className="mt-4 text-sm text-indigo-400 hover:text-indigo-300"
          >
            ← Back to Documents
          </button>
        </div>
      </div>
    )
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'chunks', label: `Chunks (${doc.chunkCount ?? 0})` },
    { id: 'conversations', label: 'Conversations' },
    { id: 'ask', label: 'Ask' },
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <button
            onClick={() => navigate('/documents')}
            className="mb-2 flex items-center gap-1 text-sm text-gray-400 hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Documents
          </button>
          <h1 className="text-2xl font-bold text-white">{doc.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-400">
            <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
            {doc.chunkCount != null && (
              <>
                <span>·</span>
                <span>{doc.chunkCount} chunks</span>
              </>
            )}
            {doc.pageCount != null && (
              <>
                <span>·</span>
                <span>{doc.pageCount} pages</span>
              </>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                doc.status === 'ready'
                  ? 'bg-green-500/20 text-green-400'
                  : doc.status === 'error'
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-yellow-500/20 text-yellow-400'
              }`}
            >
              {doc.status}
            </span>
            {doc.documentType && (
              <span className="rounded-full border border-gray-700 px-2 py-0.5 text-xs capitalize text-gray-400">
                {doc.documentType.replace('_', ' ')}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={() => navigate(`/query?docId=${docId}`)}
          disabled={doc.status !== 'ready'}
          className="flex-shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          Ask in full Query UI
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl border border-gray-800 bg-gray-900 p-1">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              activeTab === id
                ? 'bg-indigo-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {doc.summary ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <h3 className="mb-2 font-medium text-white">Summary</h3>
              <p className="text-sm leading-relaxed text-gray-300">{doc.summary}</p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <p className="text-sm text-gray-500">
                {doc.status === 'ready'
                  ? 'AI summary not yet generated. It may still be processing.'
                  : 'Summary will be available once the document finishes processing.'}
              </p>
            </div>
          )}

          {doc.topics && doc.topics.length > 0 && (
            <div>
              <h3 className="mb-3 font-medium text-white">Topics</h3>
              <div className="flex flex-wrap gap-2">
                {doc.topics.map((t) => (
                  <span key={t} className="rounded-full bg-indigo-600/20 px-3 py-1 text-sm text-indigo-300">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {doc.keyInsights && doc.keyInsights.length > 0 && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <h3 className="mb-3 font-medium text-white">Key Insights</h3>
              <ul className="space-y-2">
                {doc.keyInsights.map((insight, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="mt-0.5 flex-shrink-0 text-indigo-400">•</span>
                    <span className="text-gray-300">{insight}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {doc.entities && <EntitySection entities={doc.entities} />}
        </div>
      )}

      {activeTab === 'chunks' && (
        <div className="space-y-3">
          {!chunksData && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-2">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              ))}
            </div>
          )}

          {chunksData?.chunks.map((chunk, i) => (
            <div key={chunk.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-xs text-gray-500">
                  Chunk #{(chunksPage - 1) * CHUNKS_PER_PAGE + i + 1}
                </span>
                {chunk.token_count != null && (
                  <span className="text-xs text-gray-500">{chunk.token_count} tokens</span>
                )}
              </div>
              <p className="text-sm leading-relaxed text-gray-300">{chunk.content}</p>
            </div>
          ))}

          {chunksData && chunksData.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                disabled={chunksPage === 1}
                onClick={() => setChunksPage((p) => p - 1)}
                className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-white hover:bg-gray-800 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-gray-400">
                {chunksPage} / {chunksData.totalPages}
              </span>
              <button
                disabled={chunksPage === chunksData.totalPages}
                onClick={() => setChunksPage((p) => p + 1)}
                className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-white hover:bg-gray-800 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}

          {chunksData?.chunks.length === 0 && (
            <p className="py-8 text-center text-gray-500">No chunks found</p>
          )}
        </div>
      )}

      {activeTab === 'conversations' && (
        <div>
          {conversations.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-gray-400">No conversations have referenced this document yet.</p>
              <button
                onClick={() => setActiveTab('ask')}
                className="mt-3 text-sm text-indigo-400 hover:text-indigo-300"
              >
                Ask your first question →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {conversations.map((conv) => (
                <button
                  key={conv.session_id}
                  onClick={() => navigate(`/query?session=${conv.session_id}`)}
                  className="w-full rounded-xl border border-gray-800 bg-gray-900 p-4 text-left transition-colors hover:border-indigo-600/40 hover:bg-gray-800"
                >
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-sm font-medium text-white line-clamp-2">
                      {conv.title ?? conv.first_message ?? 'Untitled conversation'}
                    </p>
                    <span className="flex-shrink-0 text-xs text-gray-500">
                      {new Date(conv.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{conv.message_count} messages</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'ask' && (
        <InlineQueryInterface
          documentId={docId!}
          documentName={doc.name}
          workspaceId={workspaceId}
        />
      )}
    </div>
  )
}
