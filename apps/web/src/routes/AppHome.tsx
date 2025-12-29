import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

type DocumentItem = {
  id: string
  filename: string
}

type Role = 'user' | 'assistant'

type ChatMessage = {
  id: string
  role: Role
  content: string
}

function newId() {
  // Deterministic IDs are not required for UI scaffolding.
  // Replace with server ids later.
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export default function AppHome() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const [documents] = useState<DocumentItem[]>([
    { id: 'doc_1', filename: 'Quarterly_Report.pdf' },
    { id: 'doc_2', filename: 'Handbook.pdf' },
  ])

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: newId(),
      role: 'assistant',
      content: 'Ask a question about your uploaded documents.',
    },
  ])

  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const streamingMessageIdRef = useRef<string | null>(null)

  const activeUserLabel = useMemo(() => user?.email ?? user?.uid ?? 'User', [user])

  function startAssistantStreamPlaceholder() {
    // Streaming-ready placeholder:
    // When you connect your RAG service, call `appendToAssistantMessage(chunk)`
    // for each streamed token/chunk, then call `finishAssistantStream()`.
    const id = newId()
    streamingMessageIdRef.current = id
    setIsStreaming(true)
    setMessages((prev) => [...prev, { id, role: 'assistant', content: '' }])
  }

  function appendToAssistantMessage(chunk: string) {
    const id = streamingMessageIdRef.current
    if (!id) return
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content: m.content + chunk } : m)),
    )
  }

  function finishAssistantStream() {
    streamingMessageIdRef.current = null
    setIsStreaming(false)
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || isStreaming) return

    setInput('')
    setMessages((prev) => [...prev, { id: newId(), role: 'user', content: text }])

    // Placeholder for backend call.
    startAssistantStreamPlaceholder()
    appendToAssistantMessage('…')
    finishAssistantStream()
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="flex min-h-screen">
        {/* Left sidebar */}
        <aside className="hidden w-72 border-r border-zinc-800 bg-zinc-950/60 md:block">
          <div className="flex h-14 items-center justify-between px-4">
            <div>
              <p className="text-sm font-medium text-zinc-200">Documents</p>
              <p className="text-xs text-zinc-500">Uploaded files</p>
            </div>
          </div>
          <div className="px-2 pb-4">
            <ul className="space-y-1">
              {documents.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    className="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-900"
                  >
                    <p className="truncate">{d.filename}</p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Main chat */}
        <section className="flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <header className="flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-950/60 px-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-200">Chat</p>
              <p className="truncate text-xs text-zinc-500">Signed in as {activeUserLabel}</p>
            </div>
            <button
              type="button"
              className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm font-medium text-zinc-100 hover:bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
              onClick={async () => {
                await signOut()
                navigate('/', { replace: true })
              }}
            >
              Sign out
            </button>
          </header>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                >
                  <div
                    className={
                      m.role === 'user'
                        ? 'max-w-[85%] rounded-2xl bg-zinc-100 px-4 py-3 text-sm text-zinc-900'
                        : 'max-w-[85%] rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100'
                    }
                  >
                    <p className="whitespace-pre-wrap">{m.content || (m.role === 'assistant' ? ' ' : '')}</p>
                  </div>
                </div>
              ))}

              {isStreaming ? (
                <p className="text-xs text-zinc-500">Streaming…</p>
              ) : null}
            </div>
          </div>

          {/* Input */}
          <footer className="border-t border-zinc-800 bg-zinc-950/60 px-4 py-4">
            <div className="mx-auto flex w-full max-w-3xl gap-3">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your documents…"
                rows={1}
                disabled={isStreaming}
                className="max-h-32 min-h-[44px] flex-1 resize-y rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/60"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={isStreaming || input.trim().length === 0}
                className="inline-flex items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Send
              </button>
            </div>
            <p className="mx-auto mt-2 w-full max-w-3xl text-xs text-zinc-500">
              Streaming-ready: replace placeholder with RAG service stream.
            </p>
          </footer>
        </section>
      </div>
    </div>
  )
}
