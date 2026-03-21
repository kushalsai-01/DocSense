import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import type { FileRejection } from 'react-dropzone'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import type { Document } from '../types'

const MAX_SIZE = 50 * 1024 * 1024 // 50 MB
const ACCEPTED = { 'application/pdf': ['.pdf'], 'text/plain': ['.txt'] }
const MAX_WAIT_MS = 120_000 // 2 minutes

const STATUS_MESSAGES = [
  'Extracting text…',
  'Creating embeddings…',
  'Analysing document…',
  'Generating summary…',
  'Almost ready…',
]

interface DocumentUploadProps {
  workspaceId: string
  onSuccess?: (doc: Document) => void
}

export function DocumentUpload({ workspaceId, onSuccess }: DocumentUploadProps) {
  const queryClient = useQueryClient()
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [statusLabel, setStatusLabel] = useState('')
  const cancelledRef = useRef(false)

  useEffect(() => {
    return () => {
      cancelledRef.current = true
    }
  }, [])

  async function pollDocumentStatus(docId: string, docName: string): Promise<void> {
    cancelledRef.current = false
    const startMs = Date.now()
    let messageIdx = 0
    let longWarnShown = false

    const nextDelay = (elapsedMs: number): number => {
      if (elapsedMs < 30_000) return 2_000
      if (elapsedMs < 60_000) return 4_000
      return 8_000
    }

    const tick = async (): Promise<void> => {
      if (cancelledRef.current) return

      const elapsedMs = Date.now() - startMs

      if (elapsedMs > MAX_WAIT_MS) {
        setStatusLabel('Taking longer than expected…')
        setUploading(false)
        setProgress(0)
        queryClient.invalidateQueries({ queryKey: queryKeys.documents.list(workspaceId) })
        toast('Document is still processing. It will appear when ready.', { icon: '⏳' })
        return
      }

      // Show "large document" message after 60s
      if (elapsedMs > 60_000 && !longWarnShown) {
        longWarnShown = true
        setStatusLabel('Large document — AI analysis is still running. You can navigate away.')
      } else if (elapsedMs <= 60_000) {
        setStatusLabel(STATUS_MESSAGES[Math.min(messageIdx, STATUS_MESSAGES.length - 1)])
        messageIdx++
      }

      try {
        const { data: doc } = await api.get<Document>(
          `/workspaces/${workspaceId}/documents/${docId}`
        )

        if (doc.status === 'ready') {
          setStatusLabel('Ready!')
          setProgress(100)
          setTimeout(() => {
            if (cancelledRef.current) return
            setUploading(false)
            setProgress(0)
            setStatusLabel('')
            queryClient.invalidateQueries({ queryKey: queryKeys.documents.list(workspaceId) })
            toast.success(`"${docName}" is ready`)
            onSuccess?.(doc)
          }, 700)
          return
        }

        if (doc.status === 'error') {
          setUploading(false)
          setProgress(0)
          setStatusLabel('')
          toast.error(`Processing failed for "${docName}"`)
          return
        }
      } catch {
        // Network glitch — retry on next tick
      }

      const delay = nextDelay(elapsedMs)
      setTimeout(tick, delay)
    }

    await tick()
  }

  const onDrop = useCallback(
    async (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      if (fileRejections.length > 0) {
        const reason = fileRejections[0].errors[0]?.message ?? 'Invalid file'
        toast.error(reason)
        return
      }
      if (acceptedFiles.length === 0) return

      const file = acceptedFiles[0]
      const form = new FormData()
      form.append('file', file)

      setUploading(true)
      setProgress(0)
      setStatusLabel('Uploading…')

      try {
        const { data: doc } = await api.post<Document>(
          `/workspaces/${workspaceId}/documents/upload`,
          form,
          {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (e) => {
              const pct = e.total ? Math.round((e.loaded / e.total) * 80) : 0
              setProgress(pct)
            },
          },
        )
        setProgress(85)
        pollDocumentStatus(doc.id, doc.name)
      } catch (err: unknown) {
        setUploading(false)
        setProgress(0)
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Upload failed'
        toast.error(msg)
      }
    },
    [workspaceId],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxSize: MAX_SIZE,
    multiple: false,
    disabled: uploading,
  })

  return (
    <div
      {...getRootProps()}
      className={`relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-8 py-10 text-center transition-colors ${
        isDragActive
          ? 'border-indigo-500 bg-indigo-500/10'
          : 'border-gray-700 bg-gray-900 hover:border-indigo-500 hover:bg-indigo-500/5'
      } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
    >
      <input {...getInputProps()} />

      {!uploading ? (
        <>
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-800">
            <svg className="h-6 w-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <p className="text-sm font-medium text-white">
            {isDragActive ? 'Drop to upload' : 'Drag & drop a file here'}
          </p>
          <p className="mt-1 text-xs text-gray-400">PDF or TXT · max 50 MB</p>
          <button
            type="button"
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Browse files
          </button>
        </>
      ) : (
        <div className="w-full max-w-xs space-y-3">
          <p className="text-sm font-medium text-white">{statusLabel}</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-700">
            <div
              className="h-2 rounded-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-400">{progress}%</p>
        </div>
      )}
    </div>
  )
}
