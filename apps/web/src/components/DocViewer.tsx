import { useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import type { Citation } from './ChatMessage'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

type HighlightRect = {
  top: number
  left: number
  width: number
  height: number
}

type DocViewerProps = {
  docUrl: string
  citation: Citation | null
  onClose: () => void
}

/**
 * PDF viewer with text-layer driven citation highlighting.
 */
export default function DocViewer({ docUrl, citation, onClose }: DocViewerProps) {
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [highlights, setHighlights] = useState<HighlightRect[]>([])
  const pageWrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (citation?.page_num) {
      setCurrentPage(citation.page_num)
    }
  }, [citation])

  const snippetKey = useMemo(() => {
    if (!citation?.text_snippet) return ''
    return citation.text_snippet.toLowerCase().replace(/\s+/g, ' ').trim()
  }, [citation])

  /**
   * Find snippet in rendered text layer and draw translucent highlight overlays.
   */
  useEffect(() => {
    if (!snippetKey || !pageWrapRef.current) {
      setHighlights([])
      return
    }

    const run = window.setTimeout(() => {
      const root = pageWrapRef.current
      if (!root) return

      const textSpans = Array.from(
        root.querySelectorAll('.react-pdf__Page__textContent span')
      ) as HTMLSpanElement[]

      if (!textSpans.length) {
        setHighlights([])
        return
      }

      const pieces = textSpans.map((span) => span.textContent || '')
      const joined = pieces.join(' ')
      const joinedLower = joined.toLowerCase().replace(/\s+/g, ' ')
      const start = joinedLower.indexOf(snippetKey)

      if (start < 0) {
        setHighlights([])
        return
      }

      const end = start + snippetKey.length
      let offset = 0
      const indexes: number[] = []

      for (let i = 0; i < pieces.length; i += 1) {
        const value = pieces[i]
        const localStart = offset
        const localEnd = offset + value.length + (i === pieces.length - 1 ? 0 : 1)
        const overlaps = localStart < end && localEnd > start
        if (overlaps && value.trim()) {
          indexes.push(i)
        }
        offset = localEnd
      }

      const pageRect = root.getBoundingClientRect()
      const rects: HighlightRect[] = indexes
        .map((i) => textSpans[i].getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({
          top: r.top - pageRect.top,
          left: r.left - pageRect.left,
          width: r.width,
          height: r.height,
        }))

      setHighlights(rects)

      if (rects[0]) {
        const targetTop = rects[0].top - 28
        root.parentElement?.scrollTo({ top: Math.max(targetTop, 0), behavior: 'smooth' })
      }
    }, 80)

    return () => window.clearTimeout(run)
  }, [currentPage, snippetKey])

  return (
    <section
      style={{
        width: '100%',
        height: '100%',
        borderLeft: '1px solid var(--ui-border)',
        background: 'var(--ui-bg)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          height: 48,
          borderBottom: '1px solid var(--ui-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            style={navButtonStyle}
            aria-label="Previous page"
          >
            Prev
          </button>
          <span style={{ color: 'var(--ui-text-soft)', fontSize: 12 }}>
            Page {currentPage} / {numPages || '-'}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(numPages || p, p + 1))}
            style={navButtonStyle}
            aria-label="Next page"
          >
            Next
          </button>
        </div>

        <button type="button" onClick={onClose} style={navButtonStyle}>
          X
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 12,
          background: '#0f0f0f',
        }}
      >
        <div ref={pageWrapRef} style={{ position: 'relative', width: 'fit-content', margin: '0 auto' }}>
          <Document
            file={docUrl}
            onLoadSuccess={(r) => setNumPages(r.numPages)}
            loading={<div style={{ color: 'var(--ui-text-soft)' }}>Loading PDF...</div>}
            error={<div style={{ color: '#c2a7a7' }}>Failed to load PDF from {docUrl}</div>}
          >
            <Page
              pageNumber={currentPage}
              width={Math.min(820, Math.max(420, Math.floor(window.innerWidth * 0.42)))}
              renderTextLayer
              renderAnnotationLayer={false}
            />
          </Document>

          {highlights.map((h, i) => (
            <div
              key={`${h.top}-${h.left}-${i}`}
              style={{
                position: 'absolute',
                top: h.top,
                left: h.left,
                width: h.width,
                height: h.height,
                background: 'rgba(255, 230, 0, 0.4)',
                borderBottom: '2px solid #f0c000',
                pointerEvents: 'none',
              }}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

const navButtonStyle: React.CSSProperties = {
  border: '1px solid var(--ui-border)',
  background: 'var(--ui-bg-alt)',
  color: 'var(--ui-text)',
  borderRadius: 8,
  height: 28,
  padding: '0 10px',
  cursor: 'pointer',
  fontSize: 12,
}
