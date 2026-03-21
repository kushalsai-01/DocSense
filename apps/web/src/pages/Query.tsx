import { useQuery, useQueryClient } from '@tanstack/react-query'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import { streamQuery } from '../services/stream'
import { MessageSkeleton } from '../components/Skeleton'
import type {
  AnswerCompleteEvent,
  Citation,
  Conversation,
  Document,
  Message,
  PlanEvent,
  ToolCallEvent,
  ToolResultEvent,
} from '../types'
import { v4 as uuidv4 } from 'uuid'

const DEFAULT_WORKSPACE = 'default'

interface AgentStep {
  type: 'plan' | 'thinking' | 'tool_call' | 'tool_result'
  content: string
  timestamp: Date
}

interface LocalMessage extends Message {
  agentSteps?: AgentStep[]
  suggestions?: string[]
  isStreaming?: boolean
}

export default function QueryPage() {
  const [searchParams] = useSearchParams()
  const prefilteredDocId = searchParams.get('docId')
  const workspaceId = DEFAULT_WORKSPACE
  const queryClient = useQueryClient()

  const [sessionId, setSessionId] = useState<string>(uuidv4())
  const [messages, setMessages] = useState<LocalMessage[]>([])
  const [input, setInput] = useState('')
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>(
    prefilteredDocId ? [prefilteredDocId] : [],
  )
  const [streaming, setStreaming] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [traceOpen, setTraceOpen] = useState<string | null>(null)
  const [citationsOpen, setCitationsOpen] = useState<string | null>(null)
  const [similarQueries, setSimilarQueries] = useState<string[]>([])
  const lastQueryRef = useRef<string>('')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Pre-filter if navigated from Documents page
  useEffect(() => {
    if (prefilteredDocId) setSelectedDocIds([prefilteredDocId])
  }, [prefilteredDocId])

  const { data: docs = [] } = useQuery<Document[]>({
    queryKey: queryKeys.documents.list(workspaceId),
    queryFn: async () => {
      const { data } = await api.get<{ documents: Document[] }>(
        `/workspaces/${workspaceId}/documents`,
      )
      return data.documents.filter((d) => d.status === 'ready')
    },
  })

  function newConversation() {
    abortRef.current?.abort()
    setSessionId(uuidv4())
    setMessages([])
    setSelectedDocIds([])
    setSimilarQueries([])
    lastQueryRef.current = ''
  }

  const addAgentStep = useCallback((msgId: string, step: AgentStep) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, agentSteps: [...(m.agentSteps ?? []), step] } : m,
      ),
    )
  }, [])

  async function sendMessage() {
    const query = input.trim()
    if (!query || isLoading) return

    setInput('')
    setSimilarQueries([])
    lastQueryRef.current = query
    setIsLoading(true)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const userMsg: LocalMessage = {
      id: uuidv4(),
      role: 'user',
      content: query,
      citations: [],
      qualityScore: null,
      createdAt: new Date().toISOString(),
    }

    const assistantId = uuidv4()
    const assistantMsg: LocalMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      citations: [],
      qualityScore: null,
      createdAt: new Date().toISOString(),
      isStreaming: true,
      agentSteps: [],
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg])

    abortRef.current = new AbortController()

    if (!streaming) {
      // Non-streaming path
      try {
        const { data } = await api.post(`/workspaces/${workspaceId}/query`, {
          query,
          sessionId,
          documentIds: selectedDocIds.length > 0 ? selectedDocIds : undefined,
          stream: false,
        })
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: data.answer ?? '',
                  citations: data.citations ?? [],
                  qualityScore: data.qualityScore ?? null,
                  isStreaming: false,
                  suggestions: data.suggestions ?? [],
                }
              : m,
          ),
        )
      } catch {
        toast.error('Query failed')
        setMessages((prev) => prev.filter((m) => m.id !== assistantId))
      } finally {
        setIsLoading(false)
      }
      return
    }

    // Streaming path
    try {
      await streamQuery(
        workspaceId,
        {
          query,
          sessionId,
          documentIds: selectedDocIds.length > 0 ? selectedDocIds : undefined,
          stream: true,
        },
        {
          onPlan: (plan: PlanEvent) => {
            addAgentStep(assistantId, {
              type: 'plan',
              content: `Planning: ${plan.strategy} — ${plan.steps.join(', ')}`,
              timestamp: new Date(),
            })
          },
          onThinking: ({ content }) => {
            addAgentStep(assistantId, { type: 'thinking', content, timestamp: new Date() })
          },
          onToolCall: (tool: ToolCallEvent) => {
            addAgentStep(assistantId, {
              type: 'tool_call',
              content: `Tool: ${tool.tool} — ${tool.input}`,
              timestamp: new Date(),
            })
          },
          onToolResult: (result: ToolResultEvent) => {
            addAgentStep(assistantId, {
              type: 'tool_result',
              content: `Result (${result.tool}): ${result.result}`,
              timestamp: new Date(),
            })
          },
          onAnswerChunk: (chunk) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + chunk } : m,
              ),
            )
          },
          onAnswerComplete: (complete: AnswerCompleteEvent) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: complete.answer || m.content,
                      citations: complete.citations ?? [],
                      qualityScore: complete.qualityScore ?? null,
                      suggestions: complete.suggestions ?? [],
                      isStreaming: false,
                    }
                  : m,
              ),
            )
          },
          onError: (err) => {
            toast.error(err)
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, isStreaming: false } : m,
              ),
            )
          },
          onDone: () => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, isStreaming: false } : m,
              ),
            )
            queryClient.invalidateQueries({ queryKey: queryKeys.conversations(workspaceId) })

            // Fetch similar past queries — fire-and-forget
            const q = lastQueryRef.current
            if (q) {
              api
                .get<{ results?: Array<{ question: string }> }>(
                  `/workspaces/${workspaceId}/similar-queries`,
                  { params: { q, limit: 3 } }
                )
                .then(({ data }) => {
                  const qs = (data.results ?? [])
                    .map((r) => r.question)
                    .filter((s) => s && s !== q)
                    .slice(0, 3)
                  setSimilarQueries(qs)
                })
                .catch(() => {}) // best-effort
            }
          },
        },
        abortRef.current.signal,
      )
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== 'AbortError') {
        toast.error('Stream interrupted')
      }
    } finally {
      setIsLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function autoResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`
  }

  const stepIcon: Record<string, string> = {
    plan: '📋',
    thinking: '💭',
    tool_call: '🔧',
    tool_result: '📄',
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-bold text-white">Query</h1>
        <button
          onClick={newConversation}
          className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
        >
          + New conversation
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full py-20 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600/20">
              <svg className="h-8 w-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-lg font-medium text-white">Ask anything about your documents</p>
            <p className="mt-1 text-sm text-gray-400">
              Upload documents first, then ask questions with full AI reasoning
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'user' ? (
              <div className="max-w-[70%] rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-2.5 text-sm text-white">
                {msg.content}
              </div>
            ) : (
              <div className="max-w-[80%] space-y-3">
                {/* Answer */}
                <div className="rounded-2xl rounded-tl-sm border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-100">
                  {msg.content || (msg.isStreaming && <span className="inline-block h-4 w-1 animate-pulse bg-indigo-400" />)}
                  {msg.isStreaming && msg.content && (
                    <span className="inline-block h-4 w-1 animate-pulse bg-indigo-400 ml-0.5" />
                  )}
                </div>

                {/* Quality score */}
                {msg.qualityScore != null && (
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      msg.qualityScore >= 0.85 ? 'bg-green-500/20 text-green-400' :
                      msg.qualityScore >= 0.65 ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      Quality: {Math.round(msg.qualityScore * 100)}%
                    </span>
                  </div>
                )}

                {/* Citations */}
                {msg.citations.length > 0 && (
                  <div>
                    <button
                      onClick={() => setCitationsOpen(citationsOpen === msg.id ? null : msg.id)}
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      {citationsOpen === msg.id ? '▼' : '▶'} {msg.citations.length} sources
                    </button>
                    {citationsOpen === msg.id && (
                      <div className="mt-2 space-y-1.5">
                        {msg.citations.map((c: Citation) => (
                          <div key={c.chunkId} className="rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-indigo-300">{c.docName}</span>
                              <span className="rounded bg-gray-800 px-1 text-xs text-gray-400">
                                score: {c.score.toFixed(2)}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-gray-400 line-clamp-2">{c.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Agent trace */}
                {msg.agentSteps && msg.agentSteps.length > 0 && (
                  <div>
                    <button
                      onClick={() => setTraceOpen(traceOpen === msg.id ? null : msg.id)}
                      className="text-xs text-gray-500 hover:text-gray-400"
                    >
                      {traceOpen === msg.id ? '▼' : '▶'} Reasoning trace ({msg.agentSteps.length} steps)
                    </button>
                    {traceOpen === msg.id && (
                      <div className="mt-2 rounded-xl border border-gray-800 bg-gray-900/40 p-3 space-y-2">
                        {msg.agentSteps.map((step, i) => (
                          <div key={i} className="flex gap-2 text-xs text-gray-400">
                            <span className="flex-shrink-0">{stepIcon[step.type] ?? '•'}</span>
                            <span>{step.content}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Suggestions */}
                {msg.suggestions && msg.suggestions.length > 0 && !msg.isStreaming && (
                  <div className="flex flex-wrap gap-2">
                    {msg.suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          setInput(s)
                          textareaRef.current?.focus()
                        }}
                        className="rounded-full border border-indigo-600/40 bg-indigo-600/10 px-3 py-1 text-xs text-indigo-300 hover:bg-indigo-600/20"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="max-w-[80%]">
            <MessageSkeleton />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Similar queries panel */}
      {similarQueries.length > 0 && !isLoading && (
        <div className="border-t border-gray-800 bg-gray-950 px-6 pt-3 pb-0">
          <p className="text-xs text-gray-500 mb-1.5">Similar questions asked before:</p>
          <div className="flex flex-wrap gap-2">
            {similarQueries.map((q, i) => (
              <button
                key={i}
                onClick={() => setInput(q)}
                className="rounded-full border border-gray-700 bg-gray-800 px-3 py-1 text-xs text-gray-300 hover:bg-gray-700 hover:border-indigo-600/50 transition-colors"
              >
                {q.length > 60 ? `${q.slice(0, 57)}…` : q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-gray-800 bg-gray-950 px-6 py-4 space-y-3">
        {/* Doc filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">Search in:</span>
          <button
            onClick={() => setSelectedDocIds([])}
            className={`rounded-full px-2 py-0.5 text-xs ${selectedDocIds.length === 0 ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            All documents
          </button>
          {docs.map((d) => (
            <button
              key={d.id}
              onClick={() =>
                setSelectedDocIds((prev) =>
                  prev.includes(d.id) ? prev.filter((id) => id !== d.id) : [...prev, d.id],
                )
              }
              className={`max-w-[120px] truncate rounded-full px-2 py-0.5 text-xs ${
                selectedDocIds.includes(d.id)
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>

        {/* Textarea + controls */}
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={autoResize}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Ask a question about your documents…"
            className="flex-1 resize-none rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
          />

          <div className="flex flex-col items-end gap-2">
            {/* Streaming toggle */}
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-400">
              <span>Stream</span>
              <button
                type="button"
                onClick={() => setStreaming(!streaming)}
                className={`relative h-4 w-7 rounded-full transition-colors ${streaming ? 'bg-indigo-600' : 'bg-gray-700'}`}
              >
                <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${streaming ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
              </button>
            </label>

            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className="rounded-xl bg-indigo-600 p-2.5 text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              {isLoading ? (
                <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
