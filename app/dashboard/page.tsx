'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import {
  ArrowUpRight, ArrowDownRight,
  MessageSquare, Bot, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyMetricCard } from '@/components/EmptyMetricCard'
import { Sidebar } from '@/components/Sidebar'
import { getDashboardData } from '@/lib/dashboardData'
import { useStores } from '@/lib/useStores'

type Range = '24h' | '7d' | '30d'
type DashData = ReturnType<typeof getDashboardData>
type KpiViewModel = DashData['kpis'][number] & { deltaUnavailable?: boolean }

interface DashboardStats {
  conversations: {
    count: number
    deltaPct: number
  }
  aiPerformance: {
    autoSent: number
    drafted: number
    escalated: number
    aiHandleRate: number
    avgConfidence: number
  }
  avgResponseMin: number | null
  channelBreakdown: Array<{ channel: string; count: number }>
  volumeTrend: Array<{ date: string; count: number }>
  openQueue: { open: number; pending: number; closed: number }
  languageBreakdown: Array<{ language: string; count: number }>
  sentiment: { positive: number; neutral: number; negative: number } | null
}

const storeSettingsHref = '/settings'
const emptyKpiMessages: Record<string, string> = {
  revenue: 'Revenue tracking starts when you connect Shopee, Lazada, TikTok Shop, or Shopify.',
  orders: 'Order tracking starts when you connect a marketplace store.',
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function formatShare(value: number, total: number) {
  return total === 0 ? '0%' : `${Math.round((value / total) * 100)}%`
}

function formatResponseMinutes(value: number | null) {
  if (value === null) return '—'
  return value < 10 ? `${value.toFixed(1)}m` : `${Math.round(value)}m`
}

export default function DashboardPage() {
  const [range, setRange] = useState<Range>('7d')
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const { stores } = useStores()

  const data = useMemo(() => getDashboardData(range), [range])
  const {
    kpis, topTopics, customerSignals,
  } = data

  useEffect(() => {
    const controller = new AbortController()

    setStatsLoading(true)
    fetch(`/api/dashboard/stats?range=${range}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) {
          throw new Error(`Dashboard stats request failed with ${response.status}`)
        }
        return response.json() as Promise<DashboardStats>
      })
      .then(setStats)
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return
        console.error('Dashboard stats fetch error:', err)
        setStats(null)
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setStatsLoading(false)
        }
      })

    return () => controller.abort()
  }, [range])

  const liveKpis = useMemo<KpiViewModel[]>(() => {
    const hasStats = !statsLoading && stats !== null

    return kpis.map(kpi => {
      if (kpi.id === 'conversations') {
        return {
          ...kpi,
          value: hasStats ? stats.conversations.count.toLocaleString() : '—',
          deltaPct: hasStats ? stats.conversations.deltaPct : 0,
          deltaUnavailable: !hasStats,
        }
      }

      if (kpi.id === 'ai_handled') {
        return {
          ...kpi,
          value: hasStats ? formatPercent(stats.aiPerformance.aiHandleRate) : '—',
          deltaPct: 0,
          deltaUnavailable: true,
        }
      }

      if (kpi.id === 'response') {
        return {
          ...kpi,
          value: hasStats ? formatResponseMinutes(stats.avgResponseMin) : '—',
          deltaPct: 0,
          deltaUnavailable: true,
        }
      }

      return kpi
    })
  }, [kpis, stats, statsLoading])

  const liveAiBreakdown = !statsLoading && stats
    ? {
        autoSent: stats.aiPerformance.autoSent,
        drafted: stats.aiPerformance.drafted,
        escalated: stats.aiPerformance.escalated,
        avgConfidence: stats.aiPerformance.avgConfidence,
      }
    : { autoSent: 0, drafted: 0, escalated: 0, avgConfidence: 0 }

  const totalAiReplies = liveAiBreakdown.autoSent + liveAiBreakdown.drafted + liveAiBreakdown.escalated
  const totalAiRepliesLabel = statsLoading ? '—' : totalAiReplies.toLocaleString()
  const liveSentiment = !statsLoading && stats?.sentiment
    ? stats.sentiment
    : null

  return (
    <div className="flex bg-gray-50" style={{ height: '100dvh' }}>
      <Sidebar stores={stores} activeFilter="" onFilterChange={() => {}} />

      <div className="flex-1 overflow-y-auto">
        {/* ─── Header ─────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-10 bg-gray-50/80 backdrop-blur border-b border-gray-100 px-8 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Snapshot</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Across all stores · Last updated just now
              </p>
            </div>
            <div className="flex items-center gap-2">
              <RangeToggle value={range} onChange={setRange} />
            </div>
          </div>
        </header>

        <main className="px-8 py-6 space-y-6 max-w-[1400px]">

          {/* ─── KPI grid ─────────────────────────────────────────────── */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {liveKpis.map(k => {
              if (k.id === 'csat') return null
              /* HIDDEN: re-enable when commerce data is live */
              if (k.id === 'revenue') return null
              /* HIDDEN: re-enable when commerce data is live */
              if (k.id === 'orders') return null

              const emptyMessage = emptyKpiMessages[k.id]
              if (emptyMessage) {
                return (
                  <EmptyMetricCard
                    key={k.id}
                    label={k.label}
                    message={emptyMessage}
                    ctaText="Connect a store"
                    ctaHref={storeSettingsHref}
                    variant="kpi"
                  />
                )
              }

              return <KpiCard key={k.id} kpi={k} />
            })}
          </section>

          {/* HIDDEN: re-enable when commerce data is live
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <EmptyMetricCard
                label="Revenue trend"
                message="Connect a store to track revenue over time."
                ctaText="Connect a store"
                ctaHref={storeSettingsHref}
                variant="chart"
              />
            </div>

            <EmptyMetricCard
              label="Channel mix"
              message="Revenue share by channel will appear once you connect Shopee, Lazada, or TikTok Shop."
              ctaText="Connect a store"
              ctaHref={storeSettingsHref}
              variant="list"
            />
          </section>
          */}

          {/* ─── Volume trend + Channel mix ───────────────────────────── */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader
                  title="Conversation volume"
                  subtitle={`Daily conversations · ${range === '24h' ? 'today' : range === '7d' ? 'last 7 days' : 'last 30 days'}`}
                  icon={<MessageSquare className="w-4 h-4 text-indigo-600" />}
                />
                <VolumeTrendChart
                  data={stats?.volumeTrend ?? []}
                  loading={statsLoading}
                />
              </Card>
            </div>

            <Card>
              <CardHeader
                title="Channel mix"
                subtitle="Where conversations are coming from"
                icon={<MessageSquare className="w-4 h-4 text-indigo-600" />}
              />
              <ChannelMixBlock
                data={stats?.channelBreakdown ?? []}
                loading={statsLoading}
              />
            </Card>
          </section>

          {/* ─── AI Performance + Top topics ──────────────────────────── */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader
                title="AI performance"
                subtitle={`${totalAiRepliesLabel} AI-assisted replies ${range === '24h' ? 'today' : range === '7d' ? 'this week' : 'this month'}`}
                icon={<Sparkles className="w-4 h-4 text-indigo-600" />}
              />
              <AiBreakdownBar data={liveAiBreakdown} />
              <div className="grid grid-cols-3 gap-4 pt-5 mt-5 border-t border-gray-100">
                <Stat
                  label="Auto-sent"
                  value={`${liveAiBreakdown.autoSent}`}
                  sub={`${formatShare(liveAiBreakdown.autoSent, totalAiReplies)} · High confidence`}
                  accent="emerald"
                />
                <Stat
                  label="Drafted for review"
                  value={`${liveAiBreakdown.drafted}`}
                  sub={`${formatShare(liveAiBreakdown.drafted, totalAiReplies)} · Medium confidence`}
                  accent="amber"
                />
                <Stat
                  label="Escalated"
                  value={`${liveAiBreakdown.escalated}`}
                  sub={`${formatShare(liveAiBreakdown.escalated, totalAiReplies)} · Low confidence`}
                  accent="rose"
                />
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Top question topics"
                subtitle="What buyers are asking about"
                icon={<MessageSquare className="w-4 h-4 text-indigo-600" />}
              />
              <TopicList topics={topTopics} />
            </Card>
          </section>

          {/* HIDDEN: re-enable when commerce data is live
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <EmptyMetricCard
                label="Best sellers"
                message="Top products will appear once your store has orders."
                ctaText="Connect a store"
                ctaHref={storeSettingsHref}
                variant="list"
              />
            </div>

            <EmptyMetricCard
              label="Inventory alerts"
              message="Connect a store to see stock alerts."
              ctaText="Connect a store"
              ctaHref={storeSettingsHref}
              variant="list"
            />
          </section>
          */}

          {/* HIDDEN: re-enable when commerce data is live
          <section>
            <EmptyMetricCard
              label="Stores"
              message="Connect stores to compare performance."
              ctaText="Connect a store"
              ctaHref={storeSettingsHref}
              variant="list"
            />
          </section>
          */}

          {/* ─── Open queue + Language breakdown ──────────────────────── */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader
                  title="Open queue"
                  subtitle="Current conversation status across all stores"
                  icon={<MessageSquare className="w-4 h-4 text-indigo-600" />}
                />
                <OpenQueueBlock
                  data={stats?.openQueue ?? null}
                  loading={statsLoading}
                />
              </Card>
            </div>

            <Card>
              <CardHeader
                title="Language mix"
                subtitle="Languages detected in conversations"
                icon={<Bot className="w-4 h-4 text-indigo-600" />}
              />
              <LanguageBreakdownBlock
                data={stats?.languageBreakdown ?? []}
                loading={statsLoading}
              />
            </Card>
          </section>

          {/* ─── Agents + Customer signals ────────────────────────────── */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <EmptyMetricCard
                label="Agent activity"
                message="Agent stats will appear once conversations are assigned."
                ctaText="Go to inbox"
                ctaHref="/"
                variant="list"
              />
            </div>

            <Card>
              <CardHeader
                title="Customer signals"
                subtitle="Mood and mix this week"
                icon={<Bot className="w-4 h-4 text-indigo-600" />}
              />
              <CustomerSignalsBlock data={customerSignals} range={range} liveSentiment={liveSentiment} />
            </Card>
          </section>

          <div className="pb-8" />
        </main>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────
   Range toggle
   ──────────────────────────────────────────────────────────────────────── */

function RangeToggle({ value, onChange }: { value: Range; onChange: (v: Range) => void }) {
  const options: { id: Range; label: string }[] = [
    { id: '24h', label: '24h' },
    { id: '7d', label: '7d' },
    { id: '30d', label: '30d' },
  ]
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
      {options.map(o => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
            value === o.id
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────
   Card primitives
   ──────────────────────────────────────────────────────────────────────── */

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white rounded-2xl border border-gray-100 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-5', className)}>
      {children}
    </div>
  )
}

function CardHeader({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {icon && (
        <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
      )}
    </div>
  )
}

function Stat({
  label, value, sub, accent,
}: { label: string; value: string; sub?: string; accent?: 'emerald' | 'amber' | 'rose' }) {
  const dot = accent && {
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
  }[accent]
  return (
    <div>
      <div className="flex items-center gap-1.5">
        {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dot)} />}
        <p className="text-xs text-gray-500">{label}</p>
      </div>
      <p className="text-lg font-semibold text-gray-900 mt-1 tracking-tight">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────
   KPI card with sparkline
   ──────────────────────────────────────────────────────────────────────── */

function KpiCard({ kpi }: { kpi: KpiViewModel }) {
  // For response time, negative delta is good (faster).
  const isResponseTime = kpi.id === 'response'
  const neutral = kpi.deltaPct === 0
  const positive = neutral ? true : isResponseTime ? kpi.deltaPct < 0 : kpi.deltaPct > 0
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-4 flex flex-col gap-2">
      <p className="text-xs text-gray-500">{kpi.label}</p>
      <div className="flex items-end justify-between">
        <p className="text-[22px] font-semibold text-gray-900 tracking-tight leading-none">{kpi.value}</p>
        {kpi.deltaUnavailable ? (
          <span className="inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded-md text-gray-400 bg-gray-50">
            —
          </span>
        ) : (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-md',
              neutral
                ? 'text-gray-600 bg-gray-50'
                : positive
                  ? 'text-emerald-700 bg-emerald-50'
                  : 'text-rose-700 bg-rose-50'
            )}
          >
            {!neutral && (positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />)}
            {Math.abs(kpi.deltaPct).toFixed(1)}%
          </span>
        )}
      </div>
      <Sparkline data={kpi.spark} positive={positive} />
    </div>
  )
}

function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const w = 200, h = 36
  const min = Math.min(...data), max = Math.max(...data)
  const span = max - min || 1
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / span) * (h - 4) - 2
    return `${x},${y}`
  }).join(' ')

  const stroke = positive ? '#10b981' : '#f43f5e'
  const id = useMemo(() => Math.random().toString(36).slice(2), [])
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-9">
      <defs>
        <linearGradient id={`sparkGreen-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`sparkRose-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${h} ${points} ${w},${h}`}
        fill={positive ? `url(#sparkGreen-${id})` : `url(#sparkRose-${id})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* ────────────────────────────────────────────────────────────────────────
   AI breakdown bar
   ──────────────────────────────────────────────────────────────────────── */

function AiBreakdownBar({ data }: { data: DashData['aiBreakdown'] }) {
  const total = data.autoSent + data.drafted + data.escalated
  const segs = [
    { id: 'auto', label: 'Auto-sent', value: data.autoSent, color: 'bg-emerald-500' },
    { id: 'draft', label: 'Drafted', value: data.drafted, color: 'bg-amber-500' },
    { id: 'esc', label: 'Escalated', value: data.escalated, color: 'bg-rose-500' },
  ]
  return (
    <div className="space-y-3">
      <div className="flex h-7 w-full rounded-lg overflow-hidden bg-gray-100">
        {segs.map(s => {
          const share = total === 0 ? 0 : s.value / total
          return (
            <div
              key={s.id}
              className={cn(s.color, 'flex items-center justify-center text-white text-xs font-semibold')}
              style={{ width: `${share * 100}%` }}
            >
              {share >= 0.08 ? `${Math.round(share * 100)}%` : ''}
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">Avg confidence on AI replies</span>
        <span className="font-medium text-gray-900">{Math.round(data.avgConfidence * 100)}%</span>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────
   Top topics
   ──────────────────────────────────────────────────────────────────────── */

function TopicList({ topics }: { topics: DashData['topTopics'] }) {
  const max = Math.max(...topics.map(t => t.count))
  return (
    <ul className="space-y-2.5">
      {topics.map(t => (
        <li key={t.topic}>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-gray-700">{t.topic}</span>
            <span className="text-gray-500 tabular-nums">{t.count}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full"
              style={{ width: `${(t.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

/* ────────────────────────────────────────────────────────────────────────
   Live chat widgets
   ──────────────────────────────────────────────────────────────────────── */

function VolumeTrendChart({ data, loading }: { data: DashboardStats['volumeTrend']; loading: boolean }) {
  const gradientId = `volumeTrend-${useId().replace(/:/g, '')}`

  if (loading) {
    return <div className="bg-gray-100 animate-pulse rounded-lg h-20 w-full" />
  }

  const total = data.reduce((sum, point) => sum + point.count, 0)
  if (data.length === 0 || total === 0) {
    return (
      <p className="text-sm text-gray-400 h-20 flex items-center justify-center">
        No data yet.
      </p>
    )
  }

  const peakPoint = data.reduce((peak, point) => point.count > peak.count ? point : peak, data[0])
  const peakDate = formatTrendDate(peakPoint.date)
  const statRow = (
    <div className="flex items-center justify-between text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
      <span>Total: <span className="font-medium text-gray-900">{total.toLocaleString()}</span></span>
      <span>Peak: <span className="font-medium text-gray-900">{peakPoint.count.toLocaleString()}</span> on {peakDate}</span>
    </div>
  )

  if (data.length === 1) {
    return (
      <>
        <svg viewBox="0 0 400 80" className="w-full h-20">
          <circle cx="200" cy="40" r="4" fill="#6366f1" />
        </svg>
        {statRow}
      </>
    )
  }

  const w = 400
  const h = 80
  const max = Math.max(...data.map(point => point.count))
  const points = data.map((point, index) => {
    const x = (index / (data.length - 1)) * w
    const y = h - (point.count / max) * (h - 8) - 4
    return `${x},${y}`
  }).join(' ')

  return (
    <>
      <svg viewBox="0 0 400 80" className="w-full h-20">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${h} ${points} ${w},${h}`} fill={`url(#${gradientId})`} />
        <polyline
          points={points}
          fill="none"
          stroke="#6366f1"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {statRow}
    </>
  )
}

const channelMeta: Record<string, { label: string; color: string }> = {
  shopee: { label: 'Shopee', color: 'bg-orange-500' },
  lazada: { label: 'Lazada', color: 'bg-purple-500' },
  tiktok_shop: { label: 'TikTok Shop', color: 'bg-pink-500' },
  telegram: { label: 'Telegram', color: 'bg-blue-500' },
  whatsapp: { label: 'WhatsApp', color: 'bg-green-500' },
  shopify: { label: 'Shopify', color: 'bg-emerald-600' },
}

function ChannelMixBlock({ data, loading }: { data: DashboardStats['channelBreakdown']; loading: boolean }) {
  if (loading || data.length === 0) {
    return <p className="text-sm text-gray-400">No conversations yet.</p>
  }

  const max = Math.max(...data.map(item => item.count))
  return (
    <ul className="space-y-3">
      {data.map(item => {
        const meta = channelMeta[item.channel] ?? {
          label: titleCaseSlug(item.channel),
          color: 'bg-gray-400',
        }
        return (
          <li key={item.channel} className="flex items-center gap-3">
            <span className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', meta.color)} />
            <span className="w-24 truncate text-sm text-gray-700">{meta.label}</span>
            <div className="h-1.5 flex-1 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full', meta.color)}
                style={{ width: `${(item.count / max) * 100}%` }}
              />
            </div>
            <span className="w-10 text-right text-sm tabular-nums text-gray-500">{item.count.toLocaleString()}</span>
          </li>
        )
      })}
    </ul>
  )
}

function OpenQueueBlock({
  data,
  loading,
}: {
  data: DashboardStats['openQueue'] | null
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map(item => (
            <div key={item} className="space-y-2">
              <div className="h-3 w-16 rounded bg-gray-100 animate-pulse" />
              <div className="h-8 w-12 rounded bg-gray-100 animate-pulse" />
              <div className="h-3 w-14 rounded bg-gray-100 animate-pulse" />
            </div>
          ))}
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100 animate-pulse" />
      </div>
    )
  }

  if (!data) {
    return <p className="text-sm text-gray-400">No data yet.</p>
  }

  const total = data.open + data.pending + data.closed
  const items = [
    { id: 'open', label: 'Open', sub: 'open', value: data.open, text: 'text-amber-600', bar: 'bg-amber-500' },
    { id: 'pending', label: 'Pending', sub: 'awaiting', value: data.pending, text: 'text-blue-600', bar: 'bg-blue-500' },
    { id: 'closed', label: 'Closed', sub: 'resolved', value: data.closed, text: 'text-emerald-600', bar: 'bg-emerald-500' },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {items.map(item => (
          <div key={item.id}>
            <p className="text-xs text-gray-500">{item.label}</p>
            <p className={cn('text-3xl font-semibold tracking-tight mt-1', item.text)}>
              {item.value.toLocaleString()}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{item.sub}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="flex h-2 w-full rounded-full overflow-hidden bg-gray-100">
          {items.map(item => (
            <div
              key={item.id}
              className={item.bar}
              style={{ width: `${total === 0 ? 0 : (item.value / total) * 100}%` }}
            />
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-2">{total.toLocaleString()} total conversations</p>
      </div>
    </div>
  )
}

const languageLabels: Record<string, string> = {
  en: 'English',
  ms: 'Bahasa Malaysia',
  id: 'Bahasa Indonesia',
  th: 'Thai',
  tl: 'Filipino',
  vi: 'Vietnamese',
  zh: 'Chinese',
}

const languageColors = ['bg-indigo-600', 'bg-indigo-400', 'bg-indigo-300', 'bg-indigo-200']

function LanguageBreakdownBlock({
  data,
  loading,
}: {
  data: DashboardStats['languageBreakdown']
  loading: boolean
}) {
  if (loading || data.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        Language detection will appear once conversations are classified.
      </p>
    )
  }

  const max = Math.max(...data.map(item => item.count))
  return (
    <ul className="space-y-3">
      {data.map((item, index) => {
        const color = languageColors[index % languageColors.length]
        return (
          <li key={item.language} className="flex items-center gap-3">
            <span className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', color)} />
            <span className="w-32 truncate text-sm text-gray-700">{languageLabels[item.language] ?? item.language}</span>
            <div className="h-1.5 flex-1 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full', color)}
                style={{ width: `${(item.count / max) * 100}%` }}
              />
            </div>
            <span className="w-10 text-right text-sm tabular-nums text-gray-500">{item.count.toLocaleString()}</span>
          </li>
        )
      })}
    </ul>
  )
}

function titleCaseSlug(value: string) {
  return value
    .split(/[_-]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatTrendDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString('en-SG', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

/* ────────────────────────────────────────────────────────────────────────
   Customer signals
   ──────────────────────────────────────────────────────────────────────── */

function CustomerSignalsBlock({
  data,
  range,
  liveSentiment,
}: {
  data: DashData['customerSignals']
  range: Range
  liveSentiment?: DashboardStats['sentiment']
}) {
  const cs = data
  const totalCust = cs.newCustomers + cs.returningCustomers
  const sent = liveSentiment
  const periodLabel = range === '24h' ? 'today' : range === '7d' ? 'this week' : 'this month'
  return (
    <div className="space-y-5">
      {/* New vs returning */}
      <div>
        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
          <span>Customer mix</span>
          <span>{totalCust} {periodLabel}</span>
        </div>
        <div className="flex h-2 w-full rounded-full overflow-hidden bg-gray-100">
          <div className="bg-indigo-500" style={{ width: `${(cs.newCustomers / totalCust) * 100}%` }} />
          <div className="bg-indigo-200" style={{ width: `${(cs.returningCustomers / totalCust) * 100}%` }} />
        </div>
        <div className="flex items-center justify-between mt-2 text-xs">
          <span className="flex items-center gap-1.5 text-gray-600">
            <span className="w-2 h-2 rounded-full bg-indigo-500" /> New <span className="text-gray-900 font-medium">{cs.newCustomers}</span>
          </span>
          <span className="flex items-center gap-1.5 text-gray-600">
            <span className="w-2 h-2 rounded-full bg-indigo-200" /> Returning <span className="text-gray-900 font-medium">{cs.returningCustomers}</span>
          </span>
        </div>
      </div>

      {/* Sentiment */}
      <div>
        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
          <span>Sentiment (AI inferred)</span>
          {sent && (
            <span className="text-emerald-600 font-medium">+{Math.round(sent.positive * 100)}% positive</span>
          )}
        </div>
        {sent ? (
          <>
            <div className="flex h-2 w-full rounded-full overflow-hidden bg-gray-100">
              <div className="bg-emerald-500" style={{ width: `${sent.positive * 100}%` }} />
              <div className="bg-gray-300" style={{ width: `${sent.neutral * 100}%` }} />
              <div className="bg-rose-500" style={{ width: `${sent.negative * 100}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
              <div>
                <p className="text-emerald-700 font-medium">{Math.round(sent.positive * 100)}%</p>
                <p className="text-gray-400">Positive</p>
              </div>
              <div>
                <p className="text-gray-700 font-medium">{Math.round(sent.neutral * 100)}%</p>
                <p className="text-gray-400">Neutral</p>
              </div>
              <div>
                <p className="text-rose-700 font-medium">{Math.round(sent.negative * 100)}%</p>
                <p className="text-gray-400">Negative</p>
              </div>
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-400 mt-2">
            Sentiment data will appear once conversations are classified.
          </p>
        )}
      </div>

      {/* HIDDEN: re-enable when sentiment trend data is live
      <div>
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>Positive sentiment trend</span>
        </div>
        <Sparkline data={cs.sentimentTrend} positive />
      </div>
      */}
    </div>
  )
}
