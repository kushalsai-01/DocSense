import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import ChatMessage, { type ChatMessageModel, type Citation } from '../components/ChatMessage'
import DocViewer from '../components/DocViewer'

type DocumentItem = {
  id: string
  doc_name: string
  file_url?: string
  page_count?: number | null
  chunk_count?: number | null
  status?: string
}

type UploadPhase = 'idle' | 'uploading' | 'extracting' | 'chunking' | 'indexing' | 'ready' | 'failed'

const WORKSPACE_FALLBACK = 'default'

function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Normalize citation payload from API variants.
 */
function normalizeCitation(raw: Record<string, unknown>, index: number): Citation {
  const id = String(raw.id || raw.chunk_id || `c${index + 1}`)
  return {
    id: id.startsWith('c') ? id : `c${index + 1}`,
    doc_id: String(raw.doc_id || raw.document_id || ''),
    doc_name: String(raw.doc_name || 'document.pdf'),
    page_num: Number(raw.page_num || 1),
    text_snippet: String(raw.text_snippet || ''),
    char_start: Number(raw.char_start || 0),
    char_end: Number(raw.char_end || 0),
  }
}

/**
 * Resolve likely PDF URL for a citation/document.
 */
function resolveDocUrl(citation: Citation | null, documents: DocumentItem[]): string {
  if (!citation) return ''
  const match = documents.find((d) => d.id === citation.doc_id)
  if (match?.file_url) return match.file_url
  if (citation.doc_id) return `/api/documents/${citation.doc_id}/file`
  return `/uploads/${encodeURIComponent(citation.doc_name)}`
}

export default function AppHome() {
  const { user, logout } = useAuth()

  const [workspaceId, setWorkspaceId] = useState(WORKSPACE_FALLBACK)
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(false)

  const [messages, setMessages] = useState<ChatMessageModel[]>([])
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'rag' | 'agent'>('rag')
  const [streaming, setStreaming] = useState(false)

  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadMeta, setUploadMeta] = useState<{ page_count?: number; chunk_count?: number } | null>(null)

  const [activeCitation, setActiveCitation] = useState<Citation | null>(null)

  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const docUrl = useMemo(() => resolveDocUrl(activeCitation, documents), [activeCitation, documents])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchDocuments = useCallback(async () => {
    setDocumentsLoading(true)
    try {
      const primary = await fetch(`/api/workspaces/${workspaceId}/documents`)
      if (primary.ok) {
        const payload = await primary.json()
        const list = Array.isArray(payload.documents) ? payload.documents : payload
        setDocuments(
          (Array.isArray(list) ? list : []).map((d: Record<string, unknown>) => ({
            id: String(d.id || uid()),
            doc_name: String(d.doc_name || d.original_name || d.filename || 'Untitled.pdf'),
            status: typeof d.status === 'string' ? d.status : 'ready',
            page_count: d.page_count as number | undefined,
            chunk_count: d.chunk_count as number | undefined,
            file_url: typeof d.file_url === 'string' ? d.file_url : undefined,
          }))
        )
        return
      }

      const fallback = await fetch('/api/documents')
      if (!fallback.ok) throw new Error('Failed to load documents')
      const list = await fallback.json()
      setDocuments(
        (Array.isArray(list) ? list : []).map((d: Record<string, unknown>) => ({
          id: String(d.id || uid()),
          doc_name: String(d.doc_name || d.filename || d.title || 'Untitled.pdf'),
          status: typeof d.status === 'string' ? d.status : 'ready',
          page_count: d.page_count as number | undefined,
          chunk_count: d.chunk_count as number | undefined,
          file_url: typeof d.file_url === 'string' ? d.file_url : undefined,
        }))
      )
    } catch (err) {
      console.error(err)
      setDocuments([])
    } finally {
      setDocumentsLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/workspaces')
        if (!res.ok) return
        const data = await res.json()
        const first = Array.isArray(data.workspaces) ? data.workspaces[0] : null
        if (first?.id) {
          setWorkspaceId(String(first.id))
        }
      } catch {
        // Keep fallback workspace id.
      }
    })()
  }, [])

  /**
   * Poll document status until indexing is complete.
   */
  const pollDocumentStatus = useCallback(
    async (documentId: string) => {
      let done = false

      while (!done) {
        await new Promise((r) => setTimeout(r, 2000))

        let statusPayload: Record<string, unknown> | null = null
        try {
          const primary = await fetch(`/api/workspaces/${workspaceId}/documents/${documentId}/status`)
          if (primary.ok) statusPayload = await primary.json()
          if (!statusPayload) {
            const fallback = await fetch(`/api/documents/${documentId}/status`)
            if (fallback.ok) statusPayload = await fallback.json()
          }
        } catch {
          continue
        }

        if (!statusPayload) continue

        const status = String(statusPayload.status || '')
        const step = String(statusPayload.step || status)

        if (step.includes('extract')) setUploadPhase('extracting')
        else if (step.includes('chunk')) setUploadPhase('chunking')
        else if (step.includes('index')) setUploadPhase('indexing')

        if (status === 'ready') {
          setUploadPhase('ready')
          setUploadMeta({
            page_count: Number(statusPayload.page_count || 0),
            chunk_count: Number(statusPayload.chunk_count || 0),
          })
          setUploadProgress(100)
          done = true
          await fetchDocuments()
        }

        if (status === 'failed') {
          setUploadPhase('failed')
          setUploadError(String(statusPayload.error || statusPayload.error_message || 'Processing failed'))
          done = true
        }
      }
    },
    [fetchDocuments, workspaceId]
  )

  /**
   * Upload file via XMLHttpRequest so we can show byte-level progress events.
   */
  const uploadFile = useCallback(
    (file: File) => {
      setUploadError(null)
      setUploadMeta(null)
      setUploadPhase('uploading')
      setUploadProgress(0)

      const formData = new FormData()
      formData.append('file', file)

      const xhr = new XMLHttpRequest()
      xhr.open('POST', `/api/workspaces/${workspaceId}/documents`)

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return
        const pct = Math.round((event.loaded / event.total) * 100)
        setUploadProgress(Math.max(1, pct))
      }

      xhr.onerror = () => {
        setUploadPhase('failed')
        setUploadError('Upload failed due to network error')
      }

      xhr.onload = async () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          setUploadPhase('failed')
          setUploadError('Upload failed')
          return
        }

        let payload: Record<string, unknown> = {}
        try {
          payload = JSON.parse(xhr.responseText)
        } catch {
          payload = {}
        }

        const documentId = String(payload.documentId || payload.id || '')
        setUploadPhase('extracting')

        if (documentId) {
          await pollDocumentStatus(documentId)
        } else {
          setUploadPhase('ready')
          setUploadProgress(100)
          await fetchDocuments()
        }
      }

      xhr.send(formData)
    },
    [fetchDocuments, pollDocumentStatus, workspaceId]
  )

  /**
   * Stream assistant answer via SSE and append token-by-token into current message.
   */
  const sendQuery = useCallback(() => {
    const text = query.trim()
    if (!text || streaming) return

    const userMessage: ChatMessageModel = {
      id: uid(),
      role: 'user',
      answer: text,
    }

    const assistantId = uid()
    const assistantMessage: ChatMessageModel = {
      id: assistantId,
      role: 'assistant',
      answer: '',
      isStreaming: true,
    }

    setMessages((prev) => [...prev, userMessage, assistantMessage])
    setQuery('')
    setStreaming(true)

    const es = new EventSource(
      `/api/query?q=${encodeURIComponent(text)}&workspace=${encodeURIComponent(workspaceId)}&mode=${mode}`
    )

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'token') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, answer: `${m.answer}${data.token}` }
                : m
            )
          )
          return
        }

        if (data.type === 'citations') {
          const citations = Array.isArray(data.citations)
            ? data.citations.map((c: Record<string, unknown>, i: number) => normalizeCitation(c, i))
            : []

          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, citations } : m))
          )
          return
        }

        if (data.type === 'done') {
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m)))
          setStreaming(false)
          es.close()
        }
      } catch {
        // Ignore malformed chunk.
      }
    }

    es.onerror = () => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                answer: m.answer || 'Streaming failed. Please retry.',
                isStreaming: false,
                isError: true,
              }
            : m
        )
      )
      setStreaming(false)
      es.close()
    }
  }, [mode, query, streaming, workspaceId])

  const phaseLabel = useMemo(() => {
    if (uploadPhase === 'idle') return 'idle'
    if (uploadPhase === 'uploading') return 'uploading'
    if (uploadPhase === 'extracting') return 'extracting'
    if (uploadPhase === 'chunking') return 'chunking'
    if (uploadPhase === 'indexing') return 'indexing'
    if (uploadPhase === 'ready') return 'ready'
    return 'failed'
  }, [uploadPhase])

  const chatPanelWidth = activeCitation ? '55%' : '100%'
  const viewerWidth = activeCitation ? '45%' : '0%'

  return (
    <div style={rootStyle}>
      <style>{`:root{--ui-bg:#0c0c0c;--ui-bg-alt:#171717;--ui-border:#2a2a2a;--ui-text:#f5f5f5;--ui-text-soft:#a8a8a8;}`}</style>

      <aside style={sidebarStyle}>
        <div style={{ padding: 14, borderBottom: '1px solid var(--ui-border)', color: 'var(--ui-text)' }}>
          DocSense
        </div>

        <div style={{ padding: 12 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md,.docx"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) uploadFile(file)
              e.currentTarget.value = ''
            }}
          />
          <button type="button" style={buttonStyle} onClick={() => fileInputRef.current?.click()}>
            Upload Document
          </button>

          {uploadPhase !== 'idle' && (
            <div style={{ marginTop: 10, border: '1px solid var(--ui-border)', borderRadius: 8, padding: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--ui-text-soft)', marginBottom: 6 }}>
                {phaseLabel}
              </div>
              <div style={{ height: 8, borderRadius: 4, background: '#1a1a1a', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${uploadProgress}%`,
                    background: '#d9d9d9',
                    transition: 'width 200ms ease',
                  }}
                />
              </div>
              {uploadMeta && (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ui-text-soft)' }}>
                  pages: {uploadMeta.page_count || 0} · chunks: {uploadMeta.chunk_count || 0}
                </div>
              )}
              {uploadError && <div style={{ marginTop: 6, fontSize: 12, color: '#d0a5a5' }}>{uploadError}</div>}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--ui-text-soft)', marginBottom: 8 }}>Documents</div>
          {documentsLoading && <div style={{ color: 'var(--ui-text-soft)', fontSize: 12 }}>Loading...</div>}
          {!documentsLoading && documents.length === 0 && (
            <div style={{ color: 'var(--ui-text-soft)', fontSize: 12 }}>No documents</div>
          )}
          {documents.map((doc) => (
            <div key={doc.id} style={docRowStyle}>
              <div style={{ color: 'var(--ui-text)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {doc.doc_name}
              </div>
              <div style={{ color: 'var(--ui-text-soft)', fontSize: 11 }}>
                {doc.status || 'ready'}
                {typeof doc.page_count === 'number' ? ` · p:${doc.page_count}` : ''}
                {typeof doc.chunk_count === 'number' ? ` · c:${doc.chunk_count}` : ''}
              </div>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid var(--ui-border)', padding: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--ui-text-soft)', marginBottom: 8 }}>{user?.email || 'anonymous'}</div>
          <button type="button" style={buttonStyle} onClick={logout}>
            Sign Out
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, display: 'flex', minWidth: 0, height: '100%' }}>
        <section style={{ ...chatPanelStyle, width: chatPanelWidth }}>
          <div style={topBarStyle}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                style={{ ...smallButtonStyle, background: mode === 'rag' ? '#2a2a2a' : 'var(--ui-bg-alt)' }}
                onClick={() => setMode('rag')}
              >
                RAG
              </button>
              <button
                type="button"
                style={{ ...smallButtonStyle, background: mode === 'agent' ? '#2a2a2a' : 'var(--ui-bg-alt)' }}
                onClick={() => setMode('agent')}
              >
                Agent
              </button>
            </div>

            <button type="button" style={smallButtonStyle} onClick={() => setMessages([])}>
              Clear
            </button>
          </div>

          <div style={messageListStyle}>
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                onCitationClick={(citation) => setActiveCitation(citation)}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div style={composerWrapStyle}>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={2}
              placeholder="Ask a question about your documents"
              style={composerStyle}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendQuery()
                }
              }}
            />
            <button type="button" style={buttonStyle} onClick={sendQuery} disabled={streaming || !query.trim()}>
              Send
            </button>
          </div>
        </section>

        <section
          style={{
            width: viewerWidth,
            transition: 'width 220ms ease',
            overflow: 'hidden',
            height: '100%',
          }}
        >
          {activeCitation && docUrl && (
            <DocViewer
              docUrl={docUrl}
              citation={activeCitation}
              onClose={() => setActiveCitation(null)}
            />
          )}
        </section>
      </main>
    </div>
  )
}

const rootStyle: React.CSSProperties = {
  display: 'flex',
  width: '100%',
  height: '100vh',
  overflow: 'hidden',
  background: 'var(--ui-bg)',
}

const sidebarStyle: React.CSSProperties = {
  width: 280,
  borderRight: '1px solid var(--ui-border)',
  display: 'flex',
  flexDirection: 'column',
  background: '#111111',
}

const chatPanelStyle: React.CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  borderRight: '1px solid var(--ui-border)',
  minWidth: 0,
  transition: 'width 220ms ease',
}

const topBarStyle: React.CSSProperties = {
  height: 48,
  borderBottom: '1px solid var(--ui-border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 12px',
}

const messageListStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
}

const composerWrapStyle: React.CSSProperties = {
  borderTop: '1px solid var(--ui-border)',
  padding: 12,
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: 10,
}

const composerStyle: React.CSSProperties = {
  resize: 'none',
  border: '1px solid var(--ui-border)',
  borderRadius: 10,
  background: 'var(--ui-bg-alt)',
  color: 'var(--ui-text)',
  padding: '10px 12px',
  outline: 'none',
  fontSize: 14,
  lineHeight: 1.45,
}

const buttonStyle: React.CSSProperties = {
  border: '1px solid var(--ui-border)',
  borderRadius: 8,
  background: 'var(--ui-bg-alt)',
  color: 'var(--ui-text)',
  height: 34,
  padding: '0 12px',
  cursor: 'pointer',
  fontSize: 12,
}

const smallButtonStyle: React.CSSProperties = {
  border: '1px solid var(--ui-border)',
  borderRadius: 8,
  background: 'var(--ui-bg-alt)',
  color: 'var(--ui-text)',
  height: 28,
  padding: '0 10px',
  cursor: 'pointer',
  fontSize: 12,
}

const docRowStyle: React.CSSProperties = {
  border: '1px solid var(--ui-border)',
  borderRadius: 8,
  padding: '8px 9px',
  marginBottom: 8,
  background: 'var(--ui-bg-alt)',
}
