import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import React, { useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { DocumentUpload } from '../components/DocumentUpload'
import { DocumentCardSkeleton } from '../components/Skeleton'
import { api } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import type { Document, DocumentStatus } from '../types'

const STATUS_COLORS: Record<DocumentStatus, string> = {
  processing: 'bg-yellow-500/20 text-yellow-400',
  ready: 'bg-green-500/20 text-green-400',
  error: 'bg-red-500/20 text-red-400',
}

function fileIcon(fileType: string) {
  if (fileType === 'pdf')
    return (
      <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    )
  return (
    <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

const SORT_OPTIONS = [
  { value: 'createdAt_desc', label: 'Newest first' },
  { value: 'createdAt_asc', label: 'Oldest first' },
  { value: 'name_asc', label: 'Name A–Z' },
]

// Stub workspace — in production this comes from user's first workspace
const DEFAULT_WORKSPACE = 'default'

export default function DocumentsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const workspaceId = DEFAULT_WORKSPACE

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | 'all'>('all')
  const [sort, setSort] = useState('createdAt_desc')
  const [expandedSummary, setExpandedSummary] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const { data: documents = [], isLoading } = useQuery<Document[]>({
    queryKey: queryKeys.documents.list(workspaceId),
    queryFn: async () => {
      const { data } = await api.get<{ documents: Document[] }>(
        `/workspaces/${workspaceId}/documents`,
      )
      return data.documents
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (docId: string) =>
      api.delete(`/workspaces/${workspaceId}/documents/${docId}`),
    onSuccess: (_, docId) => {
      queryClient.setQueryData<Document[]>(queryKeys.documents.list(workspaceId), (prev) =>
        prev?.filter((d) => d.id !== docId) ?? [],
      )
      toast.success('Document deleted')
      setDeleteConfirm(null)
    },
    onError: () => toast.error('Failed to delete document'),
  })

  const filtered = documents
    .filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false
      if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
    .sort((a, b) => {
      if (sort === 'name_asc') return a.name.localeCompare(b.name)
      if (sort === 'createdAt_asc') return a.createdAt.localeCompare(b.createdAt)
      return b.createdAt.localeCompare(a.createdAt)
    })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Documents</h1>
      </div>

      {/* Upload */}
      <DocumentUpload workspaceId={workspaceId} />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search documents…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-0 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as DocumentStatus | 'all')}
          className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        >
          <option value="all">All statuses</option>
          <option value="ready">Ready</option>
          <option value="processing">Processing</option>
          <option value="error">Error</option>
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <DocumentCardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center">
          <svg className="mx-auto mb-4 h-12 w-12 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-400">
            {documents.length === 0 ? 'Upload your first document to get started' : 'No documents match your filters'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((doc) => (
            <div key={doc.id} className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex flex-col gap-3">
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-800">
                  {fileIcon(doc.fileType)}
                </div>
                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => navigate(`/documents/${doc.id}`)}
                    className="truncate font-medium text-white hover:text-indigo-300 text-left w-full"
                  >
                    {doc.name}
                  </button>
                  <p className="text-xs text-gray-400">
                    {new Date(doc.createdAt).toLocaleDateString()} ·{' '}
                    {doc.chunkCount ? `${doc.chunkCount} chunks` : '—'}
                  </p>
                </div>
                <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[doc.status]}`}>
                  {doc.status}
                </span>
              </div>

              {/* Summary */}
              {doc.metadata?.summary && (
                <div>
                  <p className={`text-sm text-gray-400 ${expandedSummary === doc.id ? '' : 'line-clamp-2'}`}>
                    {doc.metadata.summary}
                  </p>
                  {doc.metadata.summary.length > 120 && (
                    <button
                      onClick={() => setExpandedSummary(expandedSummary === doc.id ? null : doc.id)}
                      className="mt-0.5 text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      {expandedSummary === doc.id ? 'Show less' : 'Show more'}
                    </button>
                  )}
                </div>
              )}

              {/* Topics */}
              {doc.metadata?.topics && doc.metadata.topics.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {doc.metadata.topics.slice(0, 4).map((t) => (
                    <span key={t} className="rounded-full bg-indigo-600/20 px-2 py-0.5 text-xs text-indigo-300">
                      {t}
                    </span>
                  ))}
                  {doc.metadata.topics.length > 4 && (
                    <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                      +{doc.metadata.topics.length - 4}
                    </span>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="mt-auto flex gap-2">
                <button
                  onClick={() => navigate(`/query?docId=${doc.id}`)}
                  disabled={doc.status !== 'ready'}
                  className="flex-1 rounded-lg bg-indigo-600/20 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-600/40 disabled:opacity-40"
                >
                  Ask about this doc
                </button>
                <button
                  onClick={() => setDeleteConfirm(doc.id)}
                  className="rounded-lg bg-red-600/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-600/20"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="text-lg font-bold text-white">Delete document?</h3>
            <p className="mt-1 text-sm text-gray-400">
              This will permanently remove the document and all its vectors. This cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 rounded-lg border border-gray-700 py-2 text-sm text-white hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm)}
                disabled={deleteMutation.isPending}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
