import { getAccessToken } from '../lib/api'
import type {
  AnswerCompleteEvent,
  PlanEvent,
  QueryPayload,
  ThinkingEvent,
  ToolCallEvent,
  ToolResultEvent,
} from '../types'

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

export interface StreamCallbacks {
  onPlan?: (plan: PlanEvent) => void
  onThinking?: (thinking: ThinkingEvent) => void
  onToolCall?: (tool: ToolCallEvent) => void
  onToolResult?: (result: ToolResultEvent) => void
  onAnswerChunk?: (chunk: string) => void
  onAnswerComplete?: (answer: AnswerCompleteEvent) => void
  onError?: (error: string) => void
  onDone?: () => void
}

/**
 * Open a streaming SSE connection to POST /api/documents/query with stream=true.
 * Parses the SSE event stream and dispatches callbacks as events arrive.
 */
export async function streamQuery(
  workspaceId: string,
  payload: QueryPayload,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const token = getAccessToken()
  const response = await fetch(`${BASE_URL}/workspaces/${workspaceId}/query/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ ...payload, stream: true }),
    signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error')
    callbacks.onError?.(text)
    return
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEventType = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEventType = line.slice(7).trim()
      } else if (line.startsWith('data: ')) {
        const raw = line.slice(6).trim()
        if (!raw) continue

        let data: Record<string, unknown>
        try {
          data = JSON.parse(raw)
        } catch {
          continue
        }

        switch (currentEventType) {
          case 'plan':
            callbacks.onPlan?.(data as unknown as PlanEvent)
            break
          case 'thinking':
            callbacks.onThinking?.(data as unknown as ThinkingEvent)
            break
          case 'tool_call':
            callbacks.onToolCall?.(data as unknown as ToolCallEvent)
            break
          case 'tool_result':
            callbacks.onToolResult?.(data as unknown as ToolResultEvent)
            break
          case 'answer_chunk':
            callbacks.onAnswerChunk?.((data as { content: string }).content)
            break
          case 'answer_complete':
            callbacks.onAnswerComplete?.(data as unknown as AnswerCompleteEvent)
            break
          case 'error':
            callbacks.onError?.((data as { message: string }).message)
            break
          case 'done':
            callbacks.onDone?.()
            break
        }
        currentEventType = ''
      }
    }
  }
}
