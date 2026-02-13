import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import Logo from '../components/Logo'
import { Button, Badge } from '../components/ui'
import {
  IconUpload, IconSend, IconFile, IconSearch, IconLogOut, IconMenu,
  IconX, IconSparkles, IconPlus, IconCitation, IconTrash,
} from '../components/ui/Icons'

/* ── Types ── */

type DocumentItem = {
  id: string
  title: string
  status?: string
}

type Role = 'user' | 'assistant'

type Citation = {
  chunk_id: string
  document_id?: string
  chunk_index?: number
  text_snippet?: string
}

type ChatMessage = {
  id: string
  role: Role
  content: string
  citations?: Citation[]
  isError?: boolean
}

function newId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

/* ── Constants ── */
const USER_ID = '00000000-0000-0000-0000-000000000001'

export default function AppHome() {
  const { user, signOut } = useAuth()

  /* ── Sidebar state ── */
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [search, setSearch] = useState('')

  /* ── Upload state ── */
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)

  /* ── Chat state ── */
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isQuerying, setIsQuerying] = useState(false)
  const [pipelineMode, setPipelineMode] = useState<'rag' | 'agent'>('rag')
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  /* ── Derived ── */
  const userLabel = useMemo(() => user?.email ?? 'User', [user])
  const userInitials = useMemo(() => {
    if (!user?.email) return 'U'
    return user.email
      .split('@')[0]
      .split(/[.\-_]/)
      .map(s => s[0]?.toUpperCase())
      .join('')
      .slice(0, 2)
  }, [user])

  const filteredDocs = useMemo(() => {
    if (!search.trim()) return documents
    const q = search.toLowerCase()
    return documents.filter(d => d.title.toLowerCase().includes(q))
  }, [documents, search])

  /* ── Scroll to bottom on new messages ── */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /* ── Auto-resize textarea ── */
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [input])

  /* ── Fetch documents ── */
  const fetchDocuments = useCallback(async (signal?: AbortSignal) => {
    setDocsLoading(true)
    try {
      const res = await fetch('/api/documents', {
        signal,
        headers: { 'Content-Type': 'application/json', 'X-User-Id': USER_ID },
      })
      if (!res.ok) throw new Error('Failed to fetch documents')
      const data = await res.json()
      if (Array.isArray(data)) {
        setDocuments(
          data.filter((item: unknown) => item != null).map((d: Record<string, unknown>) => ({
            id: typeof d?.id === 'string' && d.id ? d.id : newId(),
            title: typeof d?.title === 'string' && d.title ? d.title
              : typeof d?.filename === 'string' && d.filename ? d.filename
              : 'Untitled',
            status: typeof d?.status === 'string' ? d.status : 'ready',
          })),
        )
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      console.error('Failed to fetch documents:', err)
      setDocuments([])
    } finally {
      setDocsLoading(false)
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    fetchDocuments(ac.signal)
    return () => ac.abort()
  }, [fetchDocuments])

  /* ── Upload handler ── */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadError(null)
    setUploadSuccess(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: { 'X-User-Id': USER_ID },
        body: formData,
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'Upload failed' }))
        throw new Error(errBody.error || 'Upload failed')
      }

      await res.json()
      setUploadSuccess(`"${file.name}" uploaded successfully`)
      await fetchDocuments()

      // Auto-clear success message
      setTimeout(() => setUploadSuccess(null), 4000)
    } catch (err) {
      setUploadError((err as Error).message || 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  /* ── Query handler ── */
  async function handleSend() {
    const text = input.trim()
    if (!text || isQuerying) return

    setInput('')
    const userMsg: ChatMessage = { id: newId(), role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setIsQuerying(true)

    try {
      const res = await fetch('/api/documents/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': USER_ID },
        body: JSON.stringify({ query: text, top_k: 5, pipeline_mode: pipelineMode }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'Query failed' }))
        setMessages(prev => [
          ...prev,
          { id: newId(), role: 'assistant', content: errBody.error || 'Failed to get response', isError: true },
        ])
        return
      }

      const data = await res.json()

      const citations: Citation[] = Array.isArray(data.citations)
        ? data.citations.map((c: Record<string, unknown>) => ({
            chunk_id: c.chunk_id as string,
            document_id: c.document_id as string | undefined,
            chunk_index: c.chunk_index as number | undefined,
            text_snippet: c.text_snippet as string | undefined,
          }))
        : []

      setMessages(prev => [
        ...prev,
        {
          id: newId(),
          role: 'assistant',
          content: (data.answer as string) || 'No answer received',
          citations: citations.length > 0 ? citations : undefined,
        },
      ])
    } catch (err) {
      console.error('Query error:', err)
      setMessages(prev => [
        ...prev,
        { id: newId(), role: 'assistant', content: 'Network error — could not reach the server.', isError: true },
      ])
    } finally {
      setIsQuerying(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function clearChat() {
    setMessages([])
  }

  async function deleteDocument(docId: string) {
    if (!confirm('Delete this document? This cannot be undone.')) return
    
    setDeletingDocId(docId)
    try {
      const res = await fetch(`http://localhost:8080/api/documents/${docId}`, {
        method: 'DELETE',
        headers: { 'x-user-id': USER_ID },
      })

      if (!res.ok) {
        throw new Error('Failed to delete document')
      }

      setDocuments(prev => prev.filter(d => d.id !== docId))
      setUploadSuccess('Document deleted successfully')
      setTimeout(() => setUploadSuccess(null), 3000)
    } catch (err) {
      console.error('Delete error:', err)
      setUploadError('Failed to delete document')
      setTimeout(() => setUploadError(null), 3000)
    } finally {
      setDeletingDocId(null)
    }
  }

  /* ── Render ── */
  return (
    <div className="flex h-screen overflow-hidden bg-surface text-zinc-100">

      {/* ──────── Sidebar ──────── */}
      <aside
        className={`${
          sidebarOpen ? 'w-72' : 'w-0'
        } flex-shrink-0 overflow-hidden border-r border-zinc-800/50 bg-surface-raised transition-all duration-200`}
      >
        <div className="flex h-full w-72 flex-col">
          {/* Sidebar header */}
          <div className="flex h-14 items-center justify-between border-b border-zinc-800/50 px-4">
            <Logo size="sm" />
            <button
              onClick={() => setSidebarOpen(false)}
              className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-surface-overlay hover:text-zinc-300"
              aria-label="Close sidebar"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>

          {/* Upload section */}
          <div className="border-b border-zinc-800/50 p-3">
            <Button
              variant="primary"
              size="md"
              className="w-full"
              onClick={() => !uploading && fileInputRef.current?.click()}
              isLoading={uploading}
            >
              <IconUpload className="h-4 w-4" />
              {uploading ? 'Uploading…' : 'Upload document'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Upload feedback */}
            {uploadError && (
              <div className="mt-2 animate-fade-in rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-300">
                {uploadError}
                <button onClick={() => setUploadError(null)} className="ml-2 text-red-400 hover:text-red-200">✕</button>
              </div>
            )}
            {uploadSuccess && (
              <div className="mt-2 animate-fade-in rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">
                {uploadSuccess}
              </div>
            )}
          </div>

          {/* Search */}
          <div className="p-3">
            <div className="relative">
              <IconSearch className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search documents…"
                className="w-full rounded-lg border border-zinc-800/60 bg-surface py-2 pl-9 pr-3 text-sm text-zinc-200 placeholder:text-zinc-500 transition-colors focus:border-brand-500/30 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
              />
            </div>
          </div>

          {/* Documents list */}
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            {docsLoading ? (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-zinc-500">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading documents…
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <IconFile className="mx-auto h-8 w-8 text-zinc-700" />
                <p className="mt-2 text-sm text-zinc-500">
                  {search ? 'No matching documents' : 'No documents yet'}
                </p>
                {!search && (
                  <p className="mt-1 text-xs text-zinc-600">Upload a PDF, TXT, or MD file to get started</p>
                )}
              </div>
            ) : (
              <ul className="space-y-0.5">
                {filteredDocs.map(doc => (
                  <li key={doc.id}>
                    <div className="group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-surface-overlay">
                      <IconFile className="h-4 w-4 flex-shrink-0 text-zinc-500" />
                      <span className="flex-1 truncate text-zinc-300">{doc.title}</span>
                      <Badge
                        variant={doc.status === 'ready' ? 'success' : doc.status === 'processing' ? 'warning' : 'default'}
                      >
                        {doc.status ?? 'ready'}
                      </Badge>
                      <button
                        onClick={() => deleteDocument(doc.id)}
                        disabled={deletingDocId === doc.id}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-500/10 rounded text-zinc-500 hover:text-red-400 disabled:opacity-50"
                        title="Delete document"
                      >
                        {deletingDocId === doc.id ? (
                          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <IconTrash className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* User section */}
          <div className="border-t border-zinc-800/50 p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-600/20 text-xs font-semibold text-brand-300">
                {userInitials}
              </div>
              <span className="flex-1 truncate text-sm text-zinc-300">{userLabel}</span>
              <button
                onClick={signOut}
                className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-surface-overlay hover:text-red-400"
                title="Sign out"
              >
                <IconLogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ──────── Main area ──────── */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-zinc-800/50 px-4">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-surface-raised hover:text-zinc-300"
              aria-label="Open sidebar"
            >
              <IconMenu className="h-5 w-5" />
            </button>
          )}
          {!sidebarOpen && <Logo size="sm" />}

          <div className="flex-1" />

          <div className="flex items-center gap-2 rounded-lg bg-surface-raised border border-zinc-800/50 p-1">
            <button
              onClick={() => setPipelineMode('rag')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                pipelineMode === 'rag'
                  ? 'bg-brand-500/20 text-brand-300'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <IconSparkles className="h-3 w-3" />
              RAG
            </button>
            <button
              onClick={() => setPipelineMode('agent')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                pipelineMode === 'agent'
                  ? 'bg-purple-500/20 text-purple-300'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <IconSparkles className="h-3 w-3" />
              Agent
            </button>
          </div>

          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-surface-raised hover:text-zinc-300"
            >
              <IconTrash className="h-3.5 w-3.5" />
              Clear chat
            </button>
          )}
        </header>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6">
            {messages.length === 0 ? (
              /* ── Empty state ── */
              <div className="flex min-h-[60vh] flex-col items-center justify-center text-center animate-fade-in">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500/10">
                  <IconSparkles className="h-8 w-8 text-brand-400" />
                </div>
                <h2 className="mt-6 text-2xl font-semibold tracking-tight">
                  What can I help you find?
                </h2>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-400">
                  Ask a question about your uploaded documents. Answers are grounded in your data with citations.
                </p>

                {/* Quick starters */}
                <div className="mt-8 grid w-full max-w-lg gap-2 sm:grid-cols-2">
                  {[
                    'Summarize my documents',
                    'What are the key findings?',
                    'List the main topics covered',
                    'What conclusions are drawn?',
                  ].map(q => (
                    <button
                      key={q}
                      onClick={() => { setInput(q); textareaRef.current?.focus() }}
                      className="rounded-xl border border-zinc-800/60 bg-surface-raised/50 px-4 py-3 text-left text-sm text-zinc-400 transition-colors hover:border-zinc-700 hover:bg-surface-raised hover:text-zinc-200"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* ── Message list ── */
              <div className="space-y-6">
                {messages.map(m => (
                  <MessageBubble key={m.id} message={m} />
                ))}

                {/* Thinking indicator */}
                {isQuerying && (
                  <div className="flex gap-3 animate-fade-in">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-500/10">
                      <IconSparkles className="h-4 w-4 text-brand-400" />
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-brand-400/60 [animation-delay:0ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-brand-400/60 [animation-delay:150ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-brand-400/60 [animation-delay:300ms]" />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* ── Input area ── */}
        <footer className="flex-shrink-0 border-t border-zinc-800/50 bg-surface p-4">
          <div className="mx-auto max-w-3xl">
            <div className="relative rounded-2xl border border-zinc-800/60 bg-surface-raised transition-colors focus-within:border-brand-500/30 focus-within:ring-1 focus-within:ring-brand-500/20">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question about your documents…"
                rows={1}
                disabled={isQuerying}
                className="block w-full resize-none rounded-2xl bg-transparent px-4 py-3.5 pr-14 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:opacity-60"
                style={{ maxHeight: '200px' }}
              />
              <button
                onClick={handleSend}
                disabled={isQuerying || !input.trim()}
                className="absolute bottom-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white transition-all hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send message"
              >
                <IconSend className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-center text-2xs text-zinc-600">
              Answers are generated from your uploaded documents using RAG. Always verify with source citations.
            </p>
          </div>
        </footer>
      </main>
    </div>
  )
}

/* ── MessageBubble component ── */

function MessageBubble({ message }: { message: ChatMessage }) {
  const [citationsExpanded, setCitationsExpanded] = useState(false)

  if (message.role === 'user') {
    return (
      <div className="flex justify-end animate-slide-up">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-brand-600/20 border border-brand-500/10 px-4 py-3">
          <p className="text-sm leading-relaxed text-zinc-100 whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    )
  }

  // Assistant
  return (
    <div className="flex gap-3 animate-slide-up">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-500/10">
        <IconSparkles className="h-4 w-4 text-brand-400" />
      </div>
      <div className="flex-1 space-y-3">
        <div className={`text-sm leading-relaxed ${message.isError ? 'text-red-300' : 'text-zinc-200'}`}>
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>

        {/* Citations */}
        {message.citations && message.citations.length > 0 && (
          <div className="space-y-2">
            <button
              onClick={() => setCitationsExpanded(v => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-brand-400 transition-colors hover:text-brand-300"
            >
              <IconCitation className="h-3.5 w-3.5" />
              {message.citations.length} source{message.citations.length > 1 ? 's' : ''} cited
              <svg
                className={`h-3 w-3 transition-transform ${citationsExpanded ? 'rotate-180' : ''}`}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {citationsExpanded && (
              <div className="space-y-2 animate-fade-in">
                {message.citations.map((cit, idx) => (
                  <div
                    key={cit.chunk_id || idx}
                    className="rounded-lg border border-zinc-800/60 bg-surface px-3 py-2.5"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant="info">Chunk {cit.chunk_index ?? idx + 1}</Badge>
                      {cit.document_id && (
                        <span className="truncate text-2xs text-zinc-600">
                          doc: {cit.document_id.slice(0, 8)}…
                        </span>
                      )}
                    </div>
                    {cit.text_snippet && (
                      <p className="text-xs leading-relaxed text-zinc-400">
                        "{cit.text_snippet}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
