import { useMemo, useRef, useState, useEffect } from 'react'
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
    // Sidebar collapsed state
    const [collapsed, setCollapsed] = useState(false)
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  // Sidebar chat state
  const [chats, setChats] = useState([
    { id: 'chat_1', title: 'Quarterly Report Q&A' },
    { id: 'chat_2', title: 'Handbook Search' },
  ])
  // Hardcoded user ID for all API calls
  const USER_ID = '00000000-0000-0000-0000-000000000001'
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [docsLoading, setDocsLoading] = useState(false)
  const [activeChatId, setActiveChatId] = useState(chats[0]?.id ?? null)
  const [search, setSearch] = useState('')

  // Fetch documents from backend and map into the sidebar list
  async function fetchDocuments(signal?: AbortSignal) {
    setDocsLoading(true)
    console.log('FETCH user:', USER_ID)
    try {
      const res = await fetch('/api/documents', {
        signal,
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': USER_ID,
        },
      })
      if (!res.ok) throw new Error('Network response was not ok')
      const data = await res.json()
      console.log('FETCH response:', data)
      if (Array.isArray(data)) {
        setChats(
          data
            .filter((item: any) => item != null)
            .map((d: any) => ({
              id: typeof d?.id === 'string' && d.id ? d.id : newId(),
              title:
                typeof d?.title === 'string' && d.title
                  ? d.title
                  : typeof d?.filename === 'string' && d.filename
                  ? d.filename
                  : 'Untitled',
            })),
        )
      }
    } catch (err) {
      if ((err as any)?.name === 'AbortError') return
      console.error('Failed to fetch /api/documents:', err)
      setChats([])
    } finally {
      setDocsLoading(false)
    }
  }

  useEffect(() => {
    const ac = new AbortController()
    fetchDocuments(ac.signal)
    return () => ac.abort()
  }, [])

  // Upload handler
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      console.log('UPLOAD user:', USER_ID)
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: {
          'X-User-Id': USER_ID,
        },
        body: formData,
      })
      console.log('Upload response status:', res.status)
      if (!res.ok) throw new Error('Upload failed')
      await res.json()
      await fetchDocuments()
    } catch (err) {
      console.error('Upload error:', err)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Main chat state (unchanged)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const streamingMessageIdRef = useRef<string | null>(null)

  const activeUserLabel = useMemo(() => user?.email ?? user?.uid ?? 'User', [user])
  // Profile menu state
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

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

    startAssistantStreamPlaceholder()
    
    try {
      const res = await fetch('/api/documents/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': USER_ID,
        },
        body: JSON.stringify({ query: text, top_k: 5 }),
      })
      
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Query failed' }))
        appendToAssistantMessage(`Error: ${error.error || 'Failed to get response'}`)
        finishAssistantStream()
        return
      }
      
      const data = await res.json()
      appendToAssistantMessage(data.answer || 'No answer received')
      
      // Optionally store citations for future display
      if (data.citations && data.citations.length > 0) {
        // Citations could be stored in state for display
      }
      
      finishAssistantStream()
    } catch (err) {
      console.error('Query error:', err)
      appendToAssistantMessage('Error: Failed to send query')
      finishAssistantStream()
    }
  }

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      <div className="flex h-screen overflow-hidden">
        {/* Left sidebar */}
        <aside
          className={
            collapsed
              ? 'hidden md:hidden'
              : 'hidden w-[280px] border-r border-zinc-800/50 bg-zinc-950/30 md:flex flex-col relative'
          }
        >
          {/* Add document button at top */}
          <div className="px-3 pt-4 pb-2">
            <button
              type="button"
              className="w-full rounded-md border border-zinc-700 bg-transparent px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800/60 hover:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-600 transition"
              onClick={() => !uploading && fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : '+ Add document'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
          {/* New chat and collapse toggle row */}
          <div className="flex items-center gap-2 px-3 pb-3">
            <button
              type="button"
              className="flex-1 rounded-md border border-zinc-700 bg-transparent px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800/60 hover:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-600 transition"
              onClick={() => {
                const newId = `chat_${Date.now()}`
                setChats([{ id: newId, title: 'New chat' }, ...chats])
                setActiveChatId(newId)
              }}
            >
              + New chat
            </button>
            <button
              type="button"
              className="ml-1 flex items-center justify-center rounded p-1 text-zinc-400 hover:bg-zinc-800/40 focus:outline-none"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={() => setCollapsed(c => !c)}
            >
              {/* Chevron icon: left if expanded, right if collapsed */}
              <svg width="22" height="22" fill="none" viewBox="0 0 20 20">
                <path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          <div className="px-3 pb-2">
            <div className="border-b border-zinc-800/60" />
          </div>

          {/* Search section */}
          <div className="px-3 pb-2">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search chats"
              className="w-full rounded-md border border-zinc-800/40 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
            />
          </div>

          {/* Chats list */}
          <div className="flex-1 px-2 pb-3 overflow-y-auto">
            {docsLoading ? (
              <div className="px-3 text-sm text-zinc-500">Loading…</div>
            ) : chats.length === 0 ? (
              <div className="px-3 text-sm text-zinc-500">No documents</div>
            ) : (
              <ul className="space-y-1">
                {chats.map(chat => {
                  const isActive = chat.id === activeChatId
                  return (
                    <li key={chat.id}>
                      <button
                        type="button"
                        aria-pressed={isActive}
                        className={
                          isActive
                            ? 'relative w-full rounded-md bg-zinc-900/30 px-3 py-2 text-left text-sm text-zinc-100 font-medium transition-colors'
                            : 'relative w-full rounded-md px-3 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-900/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20'
                        }
                        onClick={() => setActiveChatId(chat.id)}
                      >
                        <span
                          aria-hidden="true"
                          className={
                            isActive
                              ? 'absolute left-0 top-1.5 h-[calc(100%-0.75rem)] w-0.5 rounded-full bg-zinc-200/40'
                              : 'absolute left-0 top-1.5 h-[calc(100%-0.75rem)] w-0.5 rounded-full bg-transparent'
                          }
                        />
                        <p className="truncate">{chat.title}</p>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Bottom section: profile/account area */}
          <div className="relative select-none mt-auto" ref={profileRef}
            onMouseEnter={() => setProfileMenuOpen(true)}
            onMouseLeave={() => setProfileMenuOpen(false)}
          >
            <div
              className="flex items-center gap-3 px-4 py-3 border-t border-zinc-800/40 cursor-pointer hover:bg-zinc-900/30 transition"
              onClick={() => setProfileMenuOpen(v => !v)}
            >
              <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-semibold text-zinc-200">
                {/* Avatar: initials */}
                {user?.email ? user.email.split('@')[0].split(/\W/).map(s => s[0]?.toUpperCase()).join('').slice(0,2) : 'U'}
              </div>
              <span className="text-sm text-zinc-200 truncate max-w-[120px]">{user?.email ?? 'User'}</span>
            </div>
            {/* Floating menu */}
            {profileMenuOpen && (
              <div
                className="absolute bottom-14 left-4 w-48 min-w-[180px] bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl shadow-black/30 py-2 z-50 animate-fade-in"
              >
                <button className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 transition">Account</button>
                <button className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 transition">Preferences</button>
                <button className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 transition">Help</button>
                <div className="my-2 border-t border-zinc-800" />
                <button
                  className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-zinc-800 transition"
                  onClick={() => {
                    setProfileMenuOpen(false)
                    signOut()
                  }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Main chat */}
        <section className={collapsed ? 'flex min-w-0 flex-1 flex-col w-full relative' : 'flex min-w-0 flex-1 flex-col'}>
          {/* Top bar */}
          {/* Floating sidebar expand button (when collapsed) */}
          {collapsed && (
            <button
              type="button"
              className="fixed top-6 left-2 z-30 flex items-center justify-center rounded bg-zinc-900/80 p-1 text-zinc-400 hover:bg-zinc-800/80 focus:outline-none border border-zinc-800 shadow-md"
              aria-label="Expand sidebar"
              onClick={() => setCollapsed(false)}
            >
              <svg width="22" height="22" fill="none" viewBox="0 0 20 20">
                <path d="M8 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
          {/* Fixed header */}
          <header className="flex h-12 items-center border-b border-zinc-800/60 bg-zinc-950/30 justify-center sticky top-0 z-20">
            <div className="flex w-full max-w-[800px] items-center px-4">
              {/* Left: Product name + chevron */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base font-semibold text-zinc-100">DocSense</span>
                <span className="inline-block h-4 w-4 text-zinc-400 align-middle select-none">
                  {/* Chevron Down SVG (visual only) */}
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd" /></svg>
                </span>
              </div>

              {/* Center: Context label */}
              <div className="flex-1 flex justify-center">
                <span className="text-xs font-medium text-zinc-500/80">RAG</span>
              </div>

              {/* Right: Quiet actions */}
              <div className="flex items-center gap-2">
                <button type="button" className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors duration-150 hover:bg-zinc-900/20 focus:outline-none">
                  {/* Share icon placeholder */}
                  <span className="inline-block h-4 w-4 text-zinc-400">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><circle cx="10" cy="10" r="2.5" /><path d="M10 2v2m0 12v2m8-8h-2M4 10H2m12.07-4.07l-1.42 1.42M5.35 14.65l-1.42 1.42m12.07 4.07l-1.42-1.42M5.35 5.35L3.93 3.93" /></svg>
                  </span>
                  Share
                </button>
                <button type="button" className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors duration-150 hover:bg-zinc-900/20 focus:outline-none">
                  {/* Add people icon placeholder */}
                  <span className="inline-block h-4 w-4 text-zinc-400">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><circle cx="7" cy="8" r="3" /><circle cx="13" cy="8" r="3" /><path d="M2 16c0-2.5 3-4 5-4s5 1.5 5 4" /><path d="M13 12c2 0 5 1.5 5 4" /></svg>
                  </span>
                  Add people
                </button>
              </div>
            </div>
          </header>

          {/* Messages (scrollable only) */}
          <div className="flex-1 flex justify-center px-4 py-10 overflow-hidden">
            <div className="w-full max-w-[800px] h-full flex flex-col">
              <div className="flex-1 overflow-y-auto">
                {messages.length === 0 ? (
                  <div className="flex w-full h-full items-center justify-center">
                    <div className="flex flex-col items-center justify-center">
                      <TypewriterHeadline />
                      <p className="mt-2 text-base text-zinc-400 text-center">
                        Ask a question about your documents to get grounded answers.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex w-full flex-col gap-6">
                    {messages.map((m) => (
                      <div
                        key={m.id}
                        className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                      >
                        <div
                          className={
                            m.role === 'user'
                              ? 'max-w-[85%] rounded-2xl bg-zinc-800/40 px-4 py-3 text-sm leading-6 text-zinc-100'
                              : 'max-w-[85%] px-1 text-sm leading-6 text-zinc-100'
                          }
                        >
                          <p className="whitespace-pre-wrap">{m.content || (m.role === 'assistant' ? ' ' : '')}</p>
                        </div>
                      </div>
                    ))}

                    {isStreaming ? <p className="text-xs text-zinc-500">Streaming…</p> : null}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Input (pinned to bottom) */}
          <footer className="border-t border-zinc-800/50 bg-zinc-950/30 flex justify-center py-6 px-4 sticky bottom-0 z-20">
            <div className="w-full max-w-[800px]">
              <div className="relative rounded-2xl border border-zinc-800/60 bg-zinc-950/40">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask anything"
                  rows={1}
                  disabled={isStreaming}
                  className="max-h-48 min-h-[64px] w-full resize-y rounded-2xl bg-transparent px-4 py-4 pr-24 text-sm leading-6 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={isStreaming || input.trim().length === 0}
                  className="absolute bottom-3 right-3 inline-flex items-center justify-center rounded-xl bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors duration-150 hover:bg-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send
                </button>
              </div>

              <p className="mt-2 text-center text-xs text-zinc-500/90">
                Streaming-ready: replace placeholder with RAG service stream.
              </p>
            </div>
          </footer>
        </section>
      </div>
    </div>
  )
}

// Calm, premium typewriter effect for empty-state headline
function TypewriterHeadline() {
  const fullText = "What can I help you find?";
  const [visibleText, setVisibleText] = useState("");
  useEffect(() => {
    let index = 0;
    const startDelay = window.setTimeout(() => {
      let currentText = "";
      const intervalId = window.setInterval(() => {
        if (index < fullText.length) {
          currentText += fullText[index];
          setVisibleText(currentText);
          index++;
        } else {
          window.clearInterval(intervalId);
        }
      }, 50);
    }, 300);
    return () => {
      window.clearTimeout(startDelay);
    };
  }, []);
  return (
    <div className="mb-2 text-2xl sm:text-3xl font-medium leading-relaxed text-zinc-100 text-center min-h-[2.5em]">
      {visibleText}
    </div>
  );
}
