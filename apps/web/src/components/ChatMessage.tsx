import React, { useMemo, useState } from 'react'

export type Citation = {
  id: string
  doc_id: string
  doc_name: string
  page_num: number
  text_snippet: string
  char_start: number
  char_end: number
}

export type ChatMessageModel = {
  id: string
  role: 'user' | 'assistant'
  answer: string
  citations?: Citation[]
  isStreaming?: boolean
  isError?: boolean
}

type CitationBadgeProps = {
  citation: Citation
  index: number
  onClick: (citation: Citation) => void
}

/**
 * Inline citation badge with hover tooltip and click-to-open behavior.
 */
function CitationBadge({ citation, index, onClick }: CitationBadgeProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <span style={{ position: 'relative', display: 'inline-block', margin: '0 2px' }}>
      <button
        type="button"
        onClick={() => onClick(citation)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          border: '1px solid var(--ui-border)',
          background: 'var(--ui-bg-alt)',
          color: 'var(--ui-text)',
          borderRadius: 999,
          fontSize: 11,
          lineHeight: '16px',
          minWidth: 22,
          padding: '1px 7px',
          cursor: 'pointer',
        }}
        title={`${citation.doc_name} (page ${citation.page_num})`}
      >
        [{index + 1}]
      </button>

      {hovered && (
        <div
          style={{
            position: 'absolute',
            zIndex: 40,
            left: 0,
            top: 'calc(100% + 8px)',
            width: 280,
            border: '1px solid var(--ui-border)',
            background: 'var(--ui-bg)',
            color: 'var(--ui-text-soft)',
            borderRadius: 8,
            padding: 10,
            fontSize: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ color: 'var(--ui-text)', marginBottom: 6 }}>
            {citation.doc_name} · page {citation.page_num}
          </div>
          <div style={{ lineHeight: 1.35 }}>
            "{citation.text_snippet}"
          </div>
        </div>
      )}
    </span>
  )
}

type ChatMessageProps = {
  message: ChatMessageModel
  onCitationClick: (citation: Citation) => void
}

/**
 * Renders a chat message and replaces [c1], [c2], ... tags with interactive citation badges.
 */
export default function ChatMessage({ message, onCitationClick }: ChatMessageProps) {
  const citationMap = useMemo(() => {
    const map = new Map<string, Citation>()
    for (const c of message.citations || []) {
      map.set(c.id.toLowerCase(), c)
    }
    return map
  }, [message.citations])

  const parsedContent = useMemo(() => {
    const parts: Array<{ type: 'text'; value: string } | { type: 'citation'; value: string }> = []
    const regex = /(\[c\d+\])/gi
    let cursor = 0
    let match: RegExpExecArray | null

    while ((match = regex.exec(message.answer)) !== null) {
      const [token] = match
      const index = match.index
      if (index > cursor) {
        parts.push({ type: 'text', value: message.answer.slice(cursor, index) })
      }
      parts.push({ type: 'citation', value: token })
      cursor = index + token.length
    }

    if (cursor < message.answer.length) {
      parts.push({ type: 'text', value: message.answer.slice(cursor) })
    }

    return parts
  }, [message.answer])

  if (message.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div
          style={{
            maxWidth: '82%',
            background: 'var(--ui-bg-alt)',
            color: 'var(--ui-text)',
            border: '1px solid var(--ui-border)',
            borderRadius: 12,
            padding: '10px 12px',
            whiteSpace: 'pre-wrap',
            fontSize: 14,
            lineHeight: 1.45,
          }}
        >
          {message.answer}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          border: '1px solid var(--ui-border)',
          color: 'var(--ui-text-soft)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        AI
      </div>

      <div
        style={{
          maxWidth: '95%',
          color: message.isError ? '#d4a0a0' : 'var(--ui-text)',
          whiteSpace: 'pre-wrap',
          fontSize: 14,
          lineHeight: 1.6,
        }}
      >
        {parsedContent.map((part, i) => {
          if (part.type === 'text') {
            return <React.Fragment key={`t-${i}`}>{part.value}</React.Fragment>
          }

          const key = part.value.replace(/\[|\]/g, '').toLowerCase()
          const citation = citationMap.get(key)
          if (!citation) {
            return <React.Fragment key={`m-${i}`}>{part.value}</React.Fragment>
          }

          const citationIndex = (message.citations || []).findIndex((c) => c.id.toLowerCase() === key)
          return (
            <CitationBadge
              key={`c-${i}`}
              citation={citation}
              index={citationIndex >= 0 ? citationIndex : 0}
              onClick={onCitationClick}
            />
          )
        })}

        {message.isStreaming && (
          <span style={{ marginLeft: 6, opacity: 0.8 }}>|</span>
        )}
      </div>
    </div>
  )
}
