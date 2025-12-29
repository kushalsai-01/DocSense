import { useEffect, useMemo, useState } from 'react'

type Props = {
  lines: string[]
}

type Phase = 'typing' | 'pause' | 'done'

export default function TypingLines({ lines }: Props) {
  const typingDelayMs = 28
  const linePauseMs = 450

  const [lineIndex, setLineIndex] = useState(0)
  const [charIndex, setCharIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('typing')

  const currentLine = lines[lineIndex] ?? ''

  const renderedLines = useMemo(() => {
    const done = lines.slice(0, lineIndex)
    const current = currentLine.slice(0, charIndex)
    return [...done, ...(lineIndex < lines.length ? [current] : [])]
  }, [lines, lineIndex, charIndex, currentLine])

  useEffect(() => {
    if (lines.length === 0) return

    if (phase === 'done') return

    if (phase === 'typing') {
      if (charIndex < currentLine.length) {
        const t = window.setTimeout(() => setCharIndex((v) => v + 1), typingDelayMs)
        return () => window.clearTimeout(t)
      }
      setPhase('pause')
      return
    }

    // pause
    const t = window.setTimeout(() => {
      const nextLine = lineIndex + 1
      if (nextLine >= lines.length) {
        setPhase('done')
        return
      }
      setLineIndex(nextLine)
      setCharIndex(0)
      setPhase('typing')
    }, linePauseMs)

    return () => window.clearTimeout(t)
  }, [lines, lineIndex, charIndex, phase, currentLine])

  return (
    <div className="mx-auto max-w-xl text-left font-mono text-sm leading-7 sm:text-base">
      {renderedLines.map((line, idx) => {
        const isActiveLine = idx === renderedLines.length - 1 && phase !== 'done'
        return (
          <div key={idx} className="whitespace-pre-wrap text-zinc-100">
            <span>{line}</span>
            {isActiveLine ? (
              <span
                aria-hidden="true"
                className="ml-1 inline-block h-4 w-px translate-y-[1px] bg-zinc-200/40 align-middle motion-safe:animate-[pulse_2.4s_ease-in-out_infinite]"
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
