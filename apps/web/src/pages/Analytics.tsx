import { useQuery } from '@tanstack/react-query'
import React from 'react'
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import { Skeleton } from '../components/Skeleton'
import type { AnalyticsSummary } from '../types'

const DEFAULT_WORKSPACE = 'default'

const CHART_COLORS = ['#6366f1', '#a78bfa', '#818cf8', '#c4b5fd', '#e0e7ff']

function StatCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-1 text-3xl font-bold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

function RagasBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-300">{label}</span>
        <span className="font-mono font-medium text-white">{(value).toFixed(2)}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-800">
        <div className={`h-2 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function AnalyticsPage() {
  const workspaceId = DEFAULT_WORKSPACE

  const { data, isLoading } = useQuery<AnalyticsSummary>({
    queryKey: queryKeys.analytics(workspaceId),
    queryFn: async () => {
      const { data } = await api.get<AnalyticsSummary>(`/workspaces/${workspaceId}/analytics`)
      return data
    },
    refetchInterval: 30_000,
  })

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-40" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  const ragas = data.ragasMetrics

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold text-white">Analytics</h1>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Documents indexed" value={data.totalDocuments} />
        <StatCard label="Total queries" value={data.totalQueries} />
        <StatCard
          label="Avg quality score"
          value={`${Math.round(data.avgQualityScore * 100)}%`}
          sub="Based on RAGAS"
        />
        <StatCard
          label="Avg response time"
          value={`${(data.avgResponseTimeMs / 1000).toFixed(1)}s`}
          sub="Streaming latency"
        />
      </div>

      {/* Query volume chart */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="mb-4 text-lg font-semibold text-white">Query volume (last 30 days)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data.queryVolumeByDay}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              labelStyle={{ color: '#e5e7eb' }}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke="#6366f1"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Strategy distribution + RAGAS */}
      <div className="grid gap-6 xl:grid-cols-2">
        {/* Strategy pie */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">Strategy distribution</h2>
          {data.strategyDistribution.length === 0 ? (
            <p className="text-sm text-gray-500">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={data.strategyDistribution}
                  dataKey="count"
                  nameKey="strategy"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ strategy, percent }) =>
                    `${strategy} (${Math.round((percent ?? 0) * 100)}%)`
                  }
                  labelLine={false}
                >
                  {data.strategyDistribution.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* RAGAS metrics */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">RAGAS evaluation</h2>
            <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
              n={ragas.count}
            </span>
          </div>
          {ragas.count === 0 ? (
            <p className="text-sm text-gray-500">Run queries to generate evaluation data</p>
          ) : (
            <div className="space-y-4">
              <RagasBar label="Faithfulness" value={ragas.faithfulness} />
              <RagasBar label="Answer Relevancy" value={ragas.answerRelevancy} />
              <RagasBar label="Context Recall" value={ragas.contextRecall} />
              <RagasBar label="Context Precision" value={ragas.contextPrecision} />
            </div>
          )}
        </div>
      </div>

      {/* Recent traces */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="mb-4 text-lg font-semibold text-white">Recent traces</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="pb-2 text-left font-medium text-gray-400">Query</th>
                <th className="pb-2 text-left font-medium text-gray-400">Strategy</th>
                <th className="pb-2 text-right font-medium text-gray-400">Quality</th>
                <th className="pb-2 text-right font-medium text-gray-400">Duration</th>
                <th className="pb-2 text-right font-medium text-gray-400">Time</th>
              </tr>
            </thead>
            <tbody>
              {data.recentTraces.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-gray-500">No traces yet</td>
                </tr>
              ) : (
                data.recentTraces.map((t, i) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="max-w-xs truncate py-2 pr-4 text-white">{t.query}</td>
                    <td className="py-2 pr-4">
                      <span className="rounded-full bg-indigo-600/20 px-2 py-0.5 text-xs text-indigo-300">
                        {t.strategy}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      {t.qualityScore != null ? (
                        <span className={`font-mono text-xs ${t.qualityScore >= 0.8 ? 'text-green-400' : t.qualityScore >= 0.6 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {Math.round(t.qualityScore * 100)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-2 text-right font-mono text-xs text-gray-400">
                      {(t.durationMs / 1000).toFixed(1)}s
                    </td>
                    <td className="py-2 text-right text-xs text-gray-500">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
