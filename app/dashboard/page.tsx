'use client'

import { useMemo, useState } from 'react'
import {
  BarChart3, ArrowUpRight, ArrowDownRight,
  AlertTriangle, Package, MessageSquare, Bot, ShoppingBag,
  TrendingUp, Users, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ChannelBadge } from '@/components/ChannelBadge'
import { Sidebar } from '@/components/Sidebar'
import { getDashboardData } from '@/lib/dashboardData'

type Range = '24h' | '7d' | '30d'
type DashData = ReturnType<typeof getDashboardData>

export default function DashboardPage() {
  const [range, setRange] = useState<Range>('7d')

  const data = useMemo(() => getDashboardData(range), [range])
  const {
    kpis, revenueSeries, revenueMeta, channelSplit, aiBreakdown,
    topTopics, bestSellers, inventoryAlerts, storeLeaderboard,
    agentRows, customerSignals,
  } = data

  const totalChannelRevenue = useMemo(
    () => channelSplit.reduce((s, c) => s + c.revenue, 0),
    [channelSplit]
  )

  const totalAiReplies = aiBreakdown.autoSent + aiBreakdown.drafted + aiBreakdown.escalated

  return (
    <div className="flex bg-gray-50" style={{ height: '100dvh' }}>
      <Sidebar stores={[]} activeFilter="" onFilterChange={() => {}} />

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
          <section className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            {kpis.map(k => (
              <KpiCard key={k.id} kpi={k} />
            ))}
          </section>

          {/* ─── Revenue trend + Channel mix ──────────────────────────── */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Revenue trend"
                subtitle={revenueMeta.subtitle}
                icon={<TrendingUp className="w-4 h-4 text-indigo-600" />}
              />
              <RevenueAreaChart data={revenueSeries} />
              <div className="grid grid-cols-3 gap-4 pt-4 mt-4 border-t border-gray-100">
                {revenueMeta.stats.map(s => (
                  <Stat key={s.label} label={s.label} value={s.value} sub={s.sub} />
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Channel mix"
                subtitle="Revenue share"
                icon={<BarChart3 className="w-4 h-4 text-indigo-600" />}
              />
              <ChannelMix data={channelSplit} total={totalChannelRevenue} />
            </Card>
          </section>

          {/* ─── AI Performance + Top topics ──────────────────────────── */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader
                title="AI performance"
                subtitle={`${totalAiReplies.toLocaleString()} AI-assisted replies ${range === '24h' ? 'today' : range === '7d' ? 'this week' : 'this month'}`}
                icon={<Sparkles className="w-4 h-4 text-indigo-600" />}
              />
              <AiBreakdownBar data={aiBreakdown} />
              <div className="grid grid-cols-3 gap-4 pt-5 mt-5 border-t border-gray-100">
                <Stat
                  label="Auto-sent"
                  value={`${aiBreakdown.autoSent}`}
                  sub={`${Math.round((aiBreakdown.autoSent / totalAiReplies) * 100)}% · High confidence`}
                  accent="emerald"
                />
                <Stat
                  label="Drafted for review"
                  value={`${aiBreakdown.drafted}`}
                  sub={`${Math.round((aiBreakdown.drafted / totalAiReplies) * 100)}% · Medium confidence`}
                  accent="amber"
                />
                <Stat
                  label="Escalated"
                  value={`${aiBreakdown.escalated}`}
                  sub={`${Math.round((aiBreakdown.escalated / totalAiReplies) * 100)}% · Low confidence`}
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

          {/* ─── Best sellers + Inventory alerts ──────────────────────── */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Best sellers"
                subtitle="Top 5 products by revenue · last 7 days"
                icon={<ShoppingBag className="w-4 h-4 text-indigo-600" />}
              />
              <BestSellersTable rows={bestSellers} />
            </Card>

            <Card>
              <CardHeader
                title="Inventory alerts"
                subtitle={`${inventoryAlerts.filter(i => i.status === 'out').length} out of stock · ${inventoryAlerts.filter(i => i.status === 'low').length} running low`}
                icon={<Package className="w-4 h-4 text-indigo-600" />}
              />
              <InventoryAlertList alerts={inventoryAlerts} />
            </Card>
          </section>

          {/* ─── Store leaderboard ────────────────────────────────────── */}
          <section>
            <Card>
              <CardHeader
                title="Stores"
                subtitle="Performance across every connected store"
                icon={<BarChart3 className="w-4 h-4 text-indigo-600" />}
              />
              <StoreTable rows={storeLeaderboard} />
            </Card>
          </section>

          {/* ─── Agents + Customer signals ────────────────────────────── */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Agent activity"
                subtitle="Who's replying, with how much AI help"
                icon={<Users className="w-4 h-4 text-indigo-600" />}
              />
              <AgentTable rows={agentRows} />
            </Card>

            <Card>
              <CardHeader
                title="Customer signals"
                subtitle="Mood and mix this week"
                icon={<Bot className="w-4 h-4 text-indigo-600" />}
              />
              <CustomerSignalsBlock data={customerSignals} range={range} />
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

function KpiCard({ kpi }: { kpi: DashData['kpis'][number] }) {
  // For response time, negative delta is good (faster).
  const isResponseTime = kpi.id === 'response'
  const positive = isResponseTime ? kpi.deltaPct < 0 : kpi.deltaPct > 0
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-4 flex flex-col gap-2">
      <p className="text-xs text-gray-500">{kpi.label}</p>
      <div className="flex items-end justify-between">
        <p className="text-[22px] font-semibold text-gray-900 tracking-tight leading-none">{kpi.value}</p>
        <span
          className={cn(
            'inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-md',
            positive ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'
          )}
        >
          {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {Math.abs(kpi.deltaPct).toFixed(1)}%
        </span>
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
   Revenue area chart
   ──────────────────────────────────────────────────────────────────────── */

function RevenueAreaChart({ data }: { data: DashData['revenueSeries'] }) {
  const w = 720, h = 200, pad = { l: 40, r: 12, t: 12, b: 24 }
  const innerW = w - pad.l - pad.r
  const innerH = h - pad.t - pad.b
  const values = data.map(d => d.revenue)
  const max = Math.max(...values)
  const min = 0
  const span = max - min

  const x = (i: number) => pad.l + (i / (data.length - 1)) * innerW
  const y = (v: number) => pad.t + innerH - ((v - min) / span) * innerH

  const linePts = data.map((d, i) => `${x(i)},${y(d.revenue)}`).join(' ')
  const areaPts = `${pad.l},${pad.t + innerH} ${linePts} ${pad.l + innerW},${pad.t + innerH}`

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => min + t * span)

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[200px]">
      <defs>
        <linearGradient id="revArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Y grid */}
      {yTicks.map((tv, i) => {
        const yy = y(tv)
        return (
          <g key={i}>
            <line x1={pad.l} x2={pad.l + innerW} y1={yy} y2={yy} stroke="#f3f4f6" strokeWidth="1" />
            <text x={pad.l - 8} y={yy + 3} textAnchor="end" fontSize="10" fill="#9ca3af">
              {tv >= 1000 ? `${Math.round(tv / 1000)}k` : Math.round(tv)}
            </text>
          </g>
        )
      })}

      {/* X labels (every 2nd day) */}
      {data.map((d, i) => {
        if (i % 2 !== 0) return null
        const day = d.date.slice(-2)
        return (
          <text
            key={d.date}
            x={x(i)}
            y={h - 6}
            textAnchor="middle"
            fontSize="10"
            fill="#9ca3af"
          >
            {day}
          </text>
        )
      })}

      <polygon points={areaPts} fill="url(#revArea)" />
      <polyline
        points={linePts}
        fill="none"
        stroke="#6366f1"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {data.map((d, i) => (
        <circle key={d.date} cx={x(i)} cy={y(d.revenue)} r={i === data.length - 1 ? 3.5 : 0} fill="#6366f1" />
      ))}
    </svg>
  )
}

/* ────────────────────────────────────────────────────────────────────────
   Channel mix
   ──────────────────────────────────────────────────────────────────────── */

function ChannelMix({ data, total }: { data: DashData['channelSplit']; total: number }) {
  return (
    <div className="space-y-3">
      {/* Stacked bar */}
      <div className="flex h-3 w-full rounded-full overflow-hidden bg-gray-100">
        {data.map(c => (
          <div
            key={c.channel}
            className={c.color}
            style={{ width: `${(c.revenue / total) * 100}%` }}
            title={`${c.label} · S$${c.revenue.toLocaleString()}`}
          />
        ))}
      </div>
      <ul className="space-y-2">
        {data.map(c => {
          const pct = (c.revenue / total) * 100
          return (
            <li key={c.channel} className="flex items-center gap-3 text-sm">
              <span className={cn('w-2 h-2 rounded-full flex-shrink-0', c.color)} />
              <span className="text-gray-700 flex-1 truncate">{c.label}</span>
              <span className="text-gray-400 text-xs tabular-nums">{pct.toFixed(1)}%</span>
              <span className="text-gray-900 font-medium tabular-nums w-20 text-right">
                S${(c.revenue / 1000).toFixed(1)}k
              </span>
            </li>
          )
        })}
      </ul>
    </div>
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
        {segs.map(s => (
          <div
            key={s.id}
            className={cn(s.color, 'flex items-center justify-center text-white text-xs font-semibold')}
            style={{ width: `${(s.value / total) * 100}%` }}
          >
            {(s.value / total) >= 0.08 ? `${Math.round((s.value / total) * 100)}%` : ''}
          </div>
        ))}
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
   Best sellers table
   ──────────────────────────────────────────────────────────────────────── */

function BestSellersTable({ rows }: { rows: DashData['bestSellers'] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-gray-400 uppercase tracking-wider">
          <th className="text-left font-medium py-2">Product</th>
          <th className="text-left font-medium py-2">Channel</th>
          <th className="text-right font-medium py-2">Units</th>
          <th className="text-right font-medium py-2">Revenue</th>
          <th className="text-right font-medium py-2">Stock</th>
          <th className="text-right font-medium py-2 w-24">7d trend</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(p => (
          <tr key={p.id} className="border-t border-gray-100">
            <td className="py-3 text-gray-900 font-medium">{p.name}</td>
            <td className="py-3">
              <ChannelBadge channel={p.channel} showLabel />
            </td>
            <td className="py-3 text-right tabular-nums text-gray-900">{p.unitsSold}</td>
            <td className="py-3 text-right tabular-nums text-gray-900 font-medium">
              S${p.revenue.toLocaleString()}
            </td>
            <td className="py-3 text-right">
              <span className={cn(
                'tabular-nums text-xs px-2 py-0.5 rounded-md font-medium',
                p.stock === 0 ? 'bg-rose-50 text-rose-700' :
                p.stock < 15 ? 'bg-amber-50 text-amber-700' :
                'bg-gray-50 text-gray-600'
              )}>
                {p.stock}
              </span>
            </td>
            <td className="py-3 w-24">
              <Sparkline data={p.trend} positive={p.trend[p.trend.length - 1] >= p.trend[0]} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ────────────────────────────────────────────────────────────────────────
   Inventory alerts
   ──────────────────────────────────────────────────────────────────────── */

function InventoryAlertList({ alerts }: { alerts: DashData['inventoryAlerts'] }) {
  return (
    <ul className="space-y-2.5">
      {alerts.map(a => (
        <li key={a.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
          <div className={cn(
            'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
            a.status === 'out' ? 'bg-rose-50' : 'bg-amber-50'
          )}>
            <AlertTriangle className={cn(
              'w-3.5 h-3.5',
              a.status === 'out' ? 'text-rose-600' : 'text-amber-600'
            )} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{a.product}</p>
            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
              <ChannelBadge channel={a.channel} />
              <span>·</span>
              <span>{a.store}</span>
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className={cn(
              'text-sm font-semibold tabular-nums',
              a.status === 'out' ? 'text-rose-600' : 'text-amber-600'
            )}>
              {a.status === 'out' ? 'OUT' : `${a.stock} left`}
            </p>
            <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
              {a.status === 'out' ? 'Restock now' : `${a.daysOfCover}d cover`}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}

/* ────────────────────────────────────────────────────────────────────────
   Store leaderboard table
   ──────────────────────────────────────────────────────────────────────── */

function StoreTable({ rows }: { rows: DashData['storeLeaderboard'] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-400 uppercase tracking-wider">
            <th className="text-left font-medium py-2">Store</th>
            <th className="text-left font-medium py-2">Channel</th>
            <th className="text-right font-medium py-2">Revenue</th>
            <th className="text-right font-medium py-2">Orders</th>
            <th className="text-right font-medium py-2">Conversations</th>
            <th className="text-right font-medium py-2">AI handled</th>
            <th className="text-right font-medium py-2">Avg response</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(s => (
            <tr key={s.id} className="border-t border-gray-100">
              <td className="py-3 text-gray-900 font-medium">{s.name}</td>
              <td className="py-3">
                <ChannelBadge channel={s.channel} showLabel />
              </td>
              <td className="py-3 text-right tabular-nums font-medium text-gray-900">
                S${s.revenue.toLocaleString()}
              </td>
              <td className="py-3 text-right tabular-nums text-gray-700">{s.orders}</td>
              <td className="py-3 text-right tabular-nums text-gray-700">{s.conversations}</td>
              <td className="py-3 text-right">
                <ProgressPill value={s.aiHandledPct} />
              </td>
              <td className="py-3 text-right tabular-nums text-gray-700">
                {s.avgFirstResponseMin.toFixed(1)}m
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ProgressPill({ value }: { value: number }) {
  return (
    <div className="inline-flex items-center gap-2">
      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full"
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <span className="tabular-nums text-xs text-gray-700 w-8 text-right">
        {Math.round(value * 100)}%
      </span>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────
   Agent table
   ──────────────────────────────────────────────────────────────────────── */

function AgentTable({ rows }: { rows: DashData['agentRows'] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-gray-400 uppercase tracking-wider">
          <th className="text-left font-medium py-2">Agent</th>
          <th className="text-right font-medium py-2">Handled</th>
          <th className="text-right font-medium py-2">AI assist</th>
          <th className="text-right font-medium py-2">Avg response</th>
          <th className="text-right font-medium py-2">CSAT</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(a => (
          <tr key={a.id} className="border-t border-gray-100">
            <td className="py-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white text-xs font-semibold">
                  {a.initials}
                </div>
                <span className="text-gray-900 font-medium">{a.name}</span>
              </div>
            </td>
            <td className="py-3 text-right tabular-nums text-gray-700">{a.conversationsHandled}</td>
            <td className="py-3 text-right">
              <ProgressPill value={a.aiAssistPct} />
            </td>
            <td className="py-3 text-right tabular-nums text-gray-700">{a.avgResponseMin.toFixed(1)}m</td>
            <td className="py-3 text-right tabular-nums text-gray-900 font-medium">{a.csat.toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ────────────────────────────────────────────────────────────────────────
   Customer signals
   ──────────────────────────────────────────────────────────────────────── */

function CustomerSignalsBlock({ data, range }: { data: DashData['customerSignals']; range: Range }) {
  const cs = data
  const totalCust = cs.newCustomers + cs.returningCustomers
  const sent = cs.sentiment
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
          <span className="text-emerald-600 font-medium">+{Math.round(sent.positive * 100)}% positive</span>
        </div>
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
      </div>

      {/* Sentiment 14d sparkline */}
      <div>
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>Positive sentiment trend</span>
        </div>
        <Sparkline data={cs.sentimentTrend} positive />
      </div>
    </div>
  )
}
