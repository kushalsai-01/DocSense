import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import React, { useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../auth/AuthContext'
import { Skeleton } from '../components/Skeleton'
import { api } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'

interface StorageStats {
  documents: number
  chunks: number
  conversations: number
  totalQueries: number
  avgQualityScore: number | null
  qdrantVectors: number | null
}

interface ServiceHealth {
  status: string
  services: {
    postgres: boolean
    rag: boolean
    agent: boolean
    redis: boolean
  }
  langsmith?: boolean
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`}
    />
  )
}

function StatRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-800 last:border-0">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-sm font-medium text-white">
        {value ?? <span className="text-gray-500">—</span>}
      </span>
    </div>
  )
}

export default function SettingsPage() {
  const { user, logout } = useAuth()
  const queryClient = useQueryClient()
  const [displayName, setDisplayName] = useState(user?.name ?? '')
  const [deleteDocsModal, setDeleteDocsModal] = useState(false)
  const [deleteAccountModal, setDeleteAccountModal] = useState(false)
  const [deleteAccountPassword, setDeleteAccountPassword] = useState('')

  // Health check
  const { data: health } = useQuery<ServiceHealth>({
    queryKey: queryKeys.health,
    queryFn: async () => {
      const { data } = await api.get<ServiceHealth>('/health')
      return data
    },
    refetchInterval: 30_000,
  })

  // Storage stats — use user.id as proxy key (no workspace concept in settings)
  const { data: storage, isLoading: storageLoading } = useQuery<StorageStats>({
    queryKey: queryKeys.analyticsStorage(user?.id ?? ''),
    queryFn: async () => {
      const { data } = await api.get<StorageStats>('/analytics/storage')
      return data
    },
    enabled: !!user,
  })

  // Update profile name mutation
  const updateProfile = useMutation({
    mutationFn: (name: string) => api.put('/auth/profile', { name }),
    onSuccess: () => {
      toast.success('Profile updated')
      queryClient.invalidateQueries({ queryKey: ['user'] })
    },
    onError: () => toast.error('Failed to update profile'),
  })

  // Delete all documents mutation
  const deleteAllDocs = useMutation({
    mutationFn: () => api.delete('/documents/all'),
    onSuccess: () => {
      toast.success('All documents deleted')
      setDeleteDocsModal(false)
      queryClient.invalidateQueries()
    },
    onError: () => toast.error('Failed to delete documents'),
  })

  // Delete account mutation
  const deleteAccount = useMutation({
    mutationFn: (password: string) => api.delete('/auth/account', { data: { password } }),
    onSuccess: async () => {
      toast.success('Account deleted')
      await logout()
    },
    onError: () => toast.error('Incorrect password or delete failed'),
  })

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <h1 className="text-2xl font-bold text-white">Settings</h1>

      {/* ── Section 1: Profile ── */}
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Profile</h2>

        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xl font-bold text-white">
            {(displayName || user?.name || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-white">{user?.name}</p>
            <p className="text-sm text-gray-400">{user?.email}</p>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-300">Display name</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            />
            <button
              onClick={() => updateProfile.mutate(displayName)}
              disabled={updateProfile.isPending || !displayName.trim() || displayName === user?.name}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              {updateProfile.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-300">Email</label>
          <input
            type="email"
            value={user?.email ?? ''}
            disabled
            className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-400 cursor-not-allowed"
          />
        </div>
      </section>

      {/* ── Section 2: Service integrations ── */}
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Service Status</h2>
        <div className="space-y-3">
          {[
            { label: 'Node.js API', ok: health?.status === 'ok' },
            { label: 'PostgreSQL', ok: health?.services?.postgres ?? false },
            { label: 'RAG Service', ok: health?.services?.rag ?? false },
            { label: 'Agent Service', ok: health?.services?.agent ?? false },
            { label: 'Redis', ok: health?.services?.redis ?? false },
          ].map(({ label, ok }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-sm text-gray-300">{label}</span>
              <div className="flex items-center gap-2">
                <StatusDot ok={ok} />
                <span className={`text-xs font-medium ${ok ? 'text-green-400' : 'text-red-400'}`}>
                  {ok ? 'Connected' : 'Unavailable'}
                </span>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-300">LangSmith Tracing</span>
            <div className="flex items-center gap-2">
              <StatusDot ok={health?.langsmith ?? false} />
              {health?.langsmith ? (
                <a
                  href="https://smith.langchain.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-indigo-400 hover:text-indigo-300"
                >
                  View traces →
                </a>
              ) : (
                <span className="text-xs text-gray-500">Disabled</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 3: Storage statistics ── */}
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-1">
        <h2 className="mb-4 text-lg font-semibold text-white">Storage & Usage</h2>
        {storageLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : storage ? (
          <>
            <StatRow label="Documents indexed" value={storage.documents} />
            <StatRow label="Text chunks stored" value={storage.chunks.toLocaleString()} />
            <StatRow label="Qdrant vectors" value={storage.qdrantVectors?.toLocaleString() ?? null} />
            <StatRow label="Conversations" value={storage.conversations} />
            <StatRow label="Total queries run" value={storage.totalQueries.toLocaleString()} />
            <StatRow
              label="Avg quality score"
              value={
                storage.avgQualityScore != null
                  ? `${Math.round(storage.avgQualityScore * 100)}%`
                  : null
              }
            />
          </>
        ) : (
          <p className="text-sm text-gray-500">Could not load storage stats</p>
        )}
      </section>

      {/* ── Section 4: Danger zone ── */}
      <section className="rounded-xl border border-red-800/50 bg-gray-900 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-red-400">Danger Zone</h2>

        <div className="flex items-start justify-between gap-4 rounded-lg border border-gray-800 p-4">
          <div>
            <p className="text-sm font-medium text-white">Delete all documents</p>
            <p className="text-xs text-gray-400">
              Permanently removes all documents, chunks, and vectors. Conversations are kept.
            </p>
          </div>
          <button
            onClick={() => setDeleteDocsModal(true)}
            className="flex-shrink-0 rounded-lg border border-red-700 px-3 py-1.5 text-sm text-red-400 hover:bg-red-600/10"
          >
            Delete all
          </button>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border border-gray-800 p-4">
          <div>
            <p className="text-sm font-medium text-white">Delete account</p>
            <p className="text-xs text-gray-400">
              Permanently deletes your account and all associated data. Cannot be undone.
            </p>
          </div>
          <button
            onClick={() => setDeleteAccountModal(true)}
            className="flex-shrink-0 rounded-lg bg-red-600/20 border border-red-700 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-600/30"
          >
            Delete account
          </button>
        </div>
      </section>

      {/* ── Delete docs modal ── */}
      {deleteDocsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="text-lg font-bold text-white">Delete all documents?</h3>
            <p className="mt-1 text-sm text-gray-400">
              This will delete all your documents, their text chunks, and all Qdrant vectors. This
              cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDeleteDocsModal(false)}
                className="flex-1 rounded-lg border border-gray-700 py-2 text-sm text-white hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteAllDocs.mutate()}
                disabled={deleteAllDocs.isPending}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deleteAllDocs.isPending ? 'Deleting…' : 'Delete all'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete account modal ── */}
      {deleteAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="text-lg font-bold text-white">Delete your account?</h3>
            <p className="mt-1 text-sm text-gray-400">
              Enter your password to confirm. All data will be permanently deleted.
            </p>
            <input
              type="password"
              value={deleteAccountPassword}
              onChange={(e) => setDeleteAccountPassword(e.target.value)}
              placeholder="Your password"
              className="mt-4 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-red-500 focus:outline-none"
            />
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  setDeleteAccountModal(false)
                  setDeleteAccountPassword('')
                }}
                className="flex-1 rounded-lg border border-gray-700 py-2 text-sm text-white hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteAccount.mutate(deleteAccountPassword)}
                disabled={deleteAccount.isPending || !deleteAccountPassword}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deleteAccount.isPending ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
