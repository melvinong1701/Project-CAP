'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowRight, Check, Loader2, Search, UserRound, X } from 'lucide-react'
import { Sidebar } from '@/components/Sidebar'
import { ChannelBadge } from '@/components/ChannelBadge'
import { Channel } from '@/lib/types'
import { cn } from '@/lib/utils'

type CustomerChannel = 'telegram' | 'shopee' | 'lazada' | 'tiktok_shop'
type FilterKey = 'all' | CustomerChannel | 'has_orders'

interface CustomerListItem {
  id: string
  displayName: string | null
  email: string | null
  phone: string | null
  channels: CustomerChannel[]
  conversationCount: number
  totalOrders: number
  totalSpend: number
  lastContactAt: string | null
  hasPendingMergeSuggestion: boolean
}

interface CustomerProfile {
  id: string
  organizationId: string
  displayName: string | null
  email: string | null
  phone: string | null
  notes: string | null
  telegramId: string | null
  shopeeBuyerId: string | null
  lazadaBuyerId: string | null
  tiktokBuyerId: string | null
  totalOrders: number
  totalSpend: number
  firstSeenAt: string | null
  lastContactAt: string | null
  tags: string[]
  mergeStatus: string
}

interface CustomerConversation {
  id: string
  channel: string
  storeName: string
  lastMessage: string | null
  lastMessageAt: string
  isRead: boolean
}

interface CustomerOrder {
  id: string
  channel: string
  externalOrderId: string
  status: string
  itemsSummary: string | null
  totalAmount: number | null
  currency: string
  orderPlacedAt: string | null
  trackingNumber: string | null
}

interface MergeSuggestion {
  id: string
  otherProfile: Pick<CustomerListItem, 'id' | 'displayName' | 'email' | 'phone'>
  reason: string
  confidence: string
  createdAt: string
}

interface MergeHistory {
  id: string
  direction: 'absorbed' | 'absorber'
  otherProfileSnapshot: Record<string, unknown>
  mergedBy: string
  createdAt: string
}

interface CustomerDetail {
  customer: CustomerProfile
  conversations: CustomerConversation[]
  orders: CustomerOrder[]
  mergeSuggestions: MergeSuggestion[]
  mergeHistory: MergeHistory[]
}

const filters: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'telegram', label: 'Telegram' },
  { key: 'shopee', label: 'Shopee' },
  { key: 'lazada', label: 'Lazada' },
  { key: 'tiktok_shop', label: 'TikTok Shop' },
  { key: 'has_orders', label: 'Has orders' },
]

function relativeTime(value: string | null) {
  if (!value) return 'Never'
  const diffMs = Date.now() - new Date(value).getTime()
  const minutes = Math.max(Math.floor(diffMs / 60000), 0)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short' }).format(new Date(value))
}

function formatMoney(amount: number | null | undefined, currency = 'SGD') {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount ?? 0)
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function customerChannels(customer: CustomerProfile): CustomerChannel[] {
  const channels: CustomerChannel[] = []
  if (customer.telegramId) channels.push('telegram')
  if (customer.shopeeBuyerId) channels.push('shopee')
  if (customer.lazadaBuyerId) channels.push('lazada')
  if (customer.tiktokBuyerId) channels.push('tiktok_shop')
  return channels
}

function displayName(name: string | null | undefined) {
  return name?.trim() || 'Unknown'
}

export default function CustomersPage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
  const [customers, setCustomers] = useState<CustomerListItem[]>([])
  const [total, setTotal] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [listRefreshToken, setListRefreshToken] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<CustomerDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [pendingOnly, setPendingOnly] = useState(false)

  const refreshList = () => {
    setListRefreshToken(token => token + 1)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    let cancelled = false
    async function fetchCustomers() {
      setLoading(true)
      const params = new URLSearchParams({ page: '1', per_page: '50' })
      if (debouncedQuery) params.set('q', debouncedQuery)
      if (activeFilter === 'has_orders') params.set('has_orders', 'true')
      if (activeFilter !== 'all' && activeFilter !== 'has_orders') params.set('channel', activeFilter)

      const res = await fetch(`/api/customers?${params.toString()}`)
      if (!res.ok) {
        if (!cancelled) {
          setCustomers([])
          setTotal(0)
          setLoading(false)
        }
        return
      }

      const payload = await res.json() as { data: CustomerListItem[]; total: number }
      if (!cancelled) {
        setCustomers(payload.data)
        setTotal(payload.total)
        setLoading(false)
      }
    }

    fetchCustomers()
    return () => { cancelled = true }
  }, [activeFilter, debouncedQuery, listRefreshToken])

  useEffect(() => {
    let cancelled = false
    async function fetchPendingCount() {
      const res = await fetch('/api/customers/merge-suggestions?page=1&per_page=1')
      if (!res.ok) return
      const payload = await res.json() as { total: number }
      if (!cancelled) setPendingCount(payload.total)
    }

    fetchPendingCount()
    return () => { cancelled = true }
  }, [listRefreshToken])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }

    let cancelled = false
    async function fetchDetail() {
      setDetailLoading(true)
      const res = await fetch(`/api/customers/${selectedId}`)
      if (!res.ok) {
        if (!cancelled) {
          setDetail(null)
          setDetailLoading(false)
          // Customer no longer exists (e.g. was merged in another session).
          // Close the panel and reload the list so the stale row disappears.
          if (res.status === 404) {
            setSelectedId(null)
            refreshList()
          }
        }
        return
      }

      const payload = await res.json() as CustomerDetail
      if (!cancelled) {
        setDetail(payload)
        setDetailLoading(false)
      }
    }

    fetchDetail()
    return () => { cancelled = true }
  }, [selectedId])

  const visibleCustomers = useMemo(
    () => pendingOnly ? customers.filter(customer => customer.hasPendingMergeSuggestion) : customers,
    [customers, pendingOnly]
  )

  const refreshDetail = async (id = selectedId) => {
    if (!id) return
    setDetailLoading(true)
    const res = await fetch(`/api/customers/${id}`)
    if (res.ok) {
      const payload = await res.json() as CustomerDetail
      setDetail(payload)
      setSelectedId(payload.customer.id)
    } else if (res.status === 404) {
      // Profile no longer available (merged or deleted) — close and tidy the list.
      setDetail(null)
      setSelectedId(null)
      refreshList()
    }
    setDetailLoading(false)
  }

  return (
    <div className="flex overflow-hidden bg-white" style={{ height: '100dvh' }}>
      <Sidebar stores={[]} activeFilter="" onFilterChange={() => router.push('/')} />

      <main className="flex flex-col flex-1 min-w-0 overflow-hidden bg-gray-50">
        <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/90 px-6 py-4 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Customers</h1>
              <p className="text-sm text-gray-500">{total} profiles across connected channels</p>
            </div>
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search name, phone, email, or platform ID"
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {filters.map(filter => (
              <button
                key={filter.key}
                onClick={() => {
                  setActiveFilter(filter.key)
                  setPendingOnly(false)
                }}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-medium transition',
                  activeFilter === filter.key && !pendingOnly
                    ? 'bg-indigo-600 text-white'
                    : 'border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900'
                )}
              >
                {filter.label}
              </button>
            ))}
            {pendingOnly && (
              <button
                onClick={() => setPendingOnly(false)}
                className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800"
              >
                Possible duplicates
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
          {pendingCount > 0 && !bannerDismissed && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span>{pendingCount} possible duplicate profiles need review</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPendingOnly(true)}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                >
                  Review
                </button>
                <button
                  onClick={() => setBannerDismissed(true)}
                  className="rounded-lg p-1 text-amber-700 hover:bg-amber-100"
                  title="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="w-full table-fixed border-collapse">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="w-[30%] px-4 py-3">Name</th>
                  <th className="w-[16%] px-4 py-3">Channels</th>
                  <th className="w-[14%] px-4 py-3">Last contact</th>
                  <th className="w-[12%] px-4 py-3 text-right">Conversations</th>
                  <th className="w-[10%] px-4 py-3 text-right">Orders</th>
                  <th className="w-[14%] px-4 py-3 text-right">Spend</th>
                  <th className="w-[4%] px-4 py-3 text-center">!</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {loading ? (
                  Array.from({ length: 8 }).map((_, index) => <SkeletonRow key={index} />)
                ) : visibleCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-50">
                        <UserRound className="h-5 w-5 text-gray-400" />
                      </div>
                      <p className="mt-3 text-sm font-medium text-gray-900">No customers yet.</p>
                      <p className="mt-1 text-sm text-gray-500">Customers appear here when they message a store or place an order.</p>
                    </td>
                  </tr>
                ) : visibleCustomers.map(customer => (
                  <tr
                    key={customer.id}
                    onClick={() => setSelectedId(customer.id)}
                    className="cursor-pointer transition hover:bg-indigo-50/40"
                  >
                    <td className="px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-700">
                          {displayName(customer.displayName).charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-900">{displayName(customer.displayName)}</p>
                          <p className="truncate text-xs text-gray-400">{customer.email || customer.phone || customer.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {customer.channels.length > 0 ? customer.channels.map(channel => (
                          <ChannelBadge key={channel} channel={channel as Channel} />
                        )) : <span className="text-xs text-gray-400">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{relativeTime(customer.lastContactAt)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{customer.conversationCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{customer.totalOrders}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{formatMoney(customer.totalSpend)}</td>
                    <td className="px-4 py-3 text-center">
                      {customer.hasPendingMergeSuggestion && <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {selectedId && (
        <div className="fixed inset-0 z-40">
          <button
            aria-label="Close customer details"
            className="absolute inset-0 bg-black/25"
            onClick={() => setSelectedId(null)}
          />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col border-l border-gray-200 bg-white shadow-2xl">
            {detailLoading && !detail ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading customer…
              </div>
            ) : detail ? (
              <CustomerDetailPanel
                detail={detail}
                loading={detailLoading}
                onClose={() => setSelectedId(null)}
                onRefresh={() => {
                  refreshDetail()
                  refreshList()
                }}
                onProfileChanged={(id) => {
                  setSelectedId(id)
                  refreshDetail(id)
                  refreshList()
                }}
                onMergeCompleted={(id) => {
                  setSelectedId(id)
                  refreshDetail(id)
                  refreshList()
                }}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-gray-500">
                <p>Customer not found.</p>
                <button onClick={() => setSelectedId(null)} className="text-indigo-600 hover:underline">Close</button>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

function SkeletonRow() {
  return (
    <tr>
      <td className="px-4 py-3"><div className="h-9 w-48 animate-pulse rounded-lg bg-gray-100" /></td>
      <td className="px-4 py-3"><div className="h-6 w-24 animate-pulse rounded-full bg-gray-100" /></td>
      <td className="px-4 py-3"><div className="h-4 w-16 animate-pulse rounded bg-gray-100" /></td>
      <td className="px-4 py-3"><div className="ml-auto h-4 w-8 animate-pulse rounded bg-gray-100" /></td>
      <td className="px-4 py-3"><div className="ml-auto h-4 w-8 animate-pulse rounded bg-gray-100" /></td>
      <td className="px-4 py-3"><div className="ml-auto h-4 w-20 animate-pulse rounded bg-gray-100" /></td>
      <td className="px-4 py-3" />
    </tr>
  )
}

function CustomerDetailPanel({
  detail,
  loading,
  onClose,
  onRefresh,
  onProfileChanged,
  onMergeCompleted,
}: {
  detail: CustomerDetail
  loading: boolean
  onClose: () => void
  onRefresh: () => void
  onProfileChanged: (id: string) => void
  onMergeCompleted: (id: string) => void
}) {
  const router = useRouter()
  const [form, setForm] = useState({
    displayName: detail.customer.displayName ?? '',
    email: detail.customer.email ?? '',
    phone: detail.customer.phone ?? '',
    notes: detail.customer.notes ?? '',
    tags: detail.customer.tags.join(', '),
  })
  const [saving, setSaving] = useState(false)
  const [manualMergeOpen, setManualMergeOpen] = useState(false)
  const [mergeCandidate, setMergeCandidate] = useState<CustomerListItem | null>(null)
  const [suggestionId, setSuggestionId] = useState<string | null>(null)

  useEffect(() => {
    setForm({
      displayName: detail.customer.displayName ?? '',
      email: detail.customer.email ?? '',
      phone: detail.customer.phone ?? '',
      notes: detail.customer.notes ?? '',
      tags: detail.customer.tags.join(', '),
    })
  }, [detail.customer])

  const channels = customerChannels(detail.customer)

  const saveProfile = async () => {
    setSaving(true)
    const res = await fetch(`/api/customers/${detail.customer.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: form.displayName,
        email: form.email,
        phone: form.phone,
        notes: form.notes,
        tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean),
      }),
    })

    if (res.ok) {
      const payload = await res.json() as { customer: CustomerProfile }
      onProfileChanged(payload.customer.id)
    }
    setSaving(false)
  }

  const dismissSuggestion = async (id: string) => {
    const res = await fetch(`/api/customers/merge-suggestions/${id}/dismiss`, { method: 'POST' })
    if (res.ok) onRefresh()
  }

  const openSuggestionMerge = async (suggestion: MergeSuggestion) => {
    const res = await fetch(`/api/customers/${suggestion.otherProfile.id}`)
    if (!res.ok) return
    const payload = await res.json() as CustomerDetail
    setSuggestionId(suggestion.id)
    setMergeCandidate({
      id: payload.customer.id,
      displayName: payload.customer.displayName,
      email: payload.customer.email,
      phone: payload.customer.phone,
      channels: customerChannels(payload.customer),
      conversationCount: payload.conversations.length,
      totalOrders: payload.customer.totalOrders,
      totalSpend: payload.customer.totalSpend,
      lastContactAt: payload.customer.lastContactAt,
      hasPendingMergeSuggestion: false,
    })
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 text-sm font-semibold text-indigo-700">
            {displayName(detail.customer.displayName).charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-semibold text-gray-900">{displayName(detail.customer.displayName)}</h2>
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {channels.length > 0 ? channels.map(channel => <ChannelBadge key={channel} channel={channel as Channel} showLabel />) : <span className="text-xs text-gray-400">No channel IDs</span>}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-700" title="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <section className="space-y-3">
          <SectionTitle title="Profile" />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Display name" value={form.displayName} onChange={value => setForm(prev => ({ ...prev, displayName: value }))} />
            <TextField label="Email" value={form.email} onChange={value => setForm(prev => ({ ...prev, email: value }))} />
            <TextField label="Phone" value={form.phone} onChange={value => setForm(prev => ({ ...prev, phone: value }))} />
            <TextField label="Tags" value={form.tags} onChange={value => setForm(prev => ({ ...prev, tags: value }))} />
          </div>
          <label className="block">
            <span className="text-xs font-medium text-gray-500">Notes</span>
            <textarea
              value={form.notes}
              onChange={event => setForm(prev => ({ ...prev, notes: event.target.value }))}
              rows={3}
              className="mt-1 w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
            />
          </label>
          <button
            onClick={saveProfile}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save
          </button>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 text-xs text-gray-500">
            <ReadOnly label="Telegram ID" value={detail.customer.telegramId} />
            <ReadOnly label="Shopee ID" value={detail.customer.shopeeBuyerId} />
            <ReadOnly label="Lazada ID" value={detail.customer.lazadaBuyerId} />
            <ReadOnly label="TikTok Shop ID" value={detail.customer.tiktokBuyerId} />
            <ReadOnly label="First seen" value={formatDate(detail.customer.firstSeenAt)} />
            <ReadOnly label="Last contact" value={formatDate(detail.customer.lastContactAt)} />
          </div>
        </section>

        {detail.mergeSuggestions.length > 0 && (
          <section className="mt-8 space-y-3">
            <SectionTitle title="Possible Duplicates" />
            {detail.mergeSuggestions.map(suggestion => (
              <div key={suggestion.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{displayName(suggestion.otherProfile.displayName)}</p>
                    <p className="mt-1 text-xs text-amber-900">{suggestion.reason}</p>
                  </div>
                  <span className="rounded-full bg-white px-2 py-1 text-xs font-medium capitalize text-amber-700">{suggestion.confidence}</span>
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => openSuggestionMerge(suggestion)} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">
                    Confirm merge
                  </button>
                  <button onClick={() => dismissSuggestion(suggestion.id)} className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100">
                    Not a duplicate
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        <section className="mt-8 space-y-3">
          <SectionTitle title="Conversations" />
          {detail.conversations.length > 0 ? detail.conversations.map(conversation => (
            <button
              key={conversation.id}
              onClick={() => router.push(`/?conversationId=${conversation.id}`)}
              className="flex w-full items-center gap-3 rounded-xl border border-gray-100 p-3 text-left transition hover:border-indigo-200 hover:bg-indigo-50/40"
            >
              <ChannelBadge channel={conversation.channel as Channel} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-medium text-gray-900">{conversation.storeName}</p>
                  <span className="flex-shrink-0 text-xs text-gray-400">{relativeTime(conversation.lastMessageAt)}</span>
                </div>
                <p className="mt-1 truncate text-xs text-gray-500">{conversation.lastMessage || 'No messages yet'}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-300" />
            </button>
          )) : <p className="rounded-xl border border-dashed border-gray-200 p-5 text-center text-sm text-gray-500">No conversations yet</p>}
        </section>

        <section className="mt-8 space-y-3">
          <SectionTitle title="Orders" />
          {detail.orders.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {detail.orders.map(order => (
                    <tr key={order.id}>
                      <td className="px-3 py-3"><ChannelBadge channel={order.channel as Channel} /></td>
                      <td className="max-w-[120px] truncate px-3 py-3 font-mono text-xs text-gray-700">{order.externalOrderId}</td>
                      <td className="px-3 py-3"><span className="rounded-full bg-gray-100 px-2 py-1 text-xs capitalize text-gray-700">{order.status}</span></td>
                      <td className="max-w-[160px] truncate px-3 py-3 text-gray-500">{order.itemsSummary ?? '—'}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatMoney(order.totalAmount, order.currency)}</td>
                      <td className="px-3 py-3 text-right text-xs text-gray-400">{formatDate(order.orderPlacedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="rounded-xl border border-dashed border-gray-200 p-5 text-center text-sm text-gray-500">No orders yet</p>}
        </section>

        <details className="mt-8 rounded-xl border border-gray-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-gray-900">Merge history</summary>
          <div className="mt-3 space-y-2">
            {detail.mergeHistory.length > 0 ? detail.mergeHistory.map(entry => {
              const snapshotName = typeof entry.otherProfileSnapshot.displayName === 'string'
                ? entry.otherProfileSnapshot.displayName
                : typeof entry.otherProfileSnapshot.display_name === 'string'
                  ? entry.otherProfileSnapshot.display_name
                  : 'profile'
              return (
                <p key={entry.id} className="text-xs text-gray-500">
                  {entry.direction === 'absorber' ? `Absorbed ${snapshotName}` : `Was merged into ${snapshotName}`} on {formatDate(entry.createdAt)} by {entry.mergedBy}
                </p>
              )
            }) : <p className="text-xs text-gray-400">No merge history</p>}
          </div>
        </details>

        <div className="mt-8 border-t border-gray-100 pt-5">
          <button onClick={() => setManualMergeOpen(true)} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
            Merge with another profile
          </button>
        </div>
      </div>

      {manualMergeOpen && (
        <ManualMergeModal
          current={detail.customer}
          onClose={() => setManualMergeOpen(false)}
          onPick={(candidate) => {
            setSuggestionId(null)
            setMergeCandidate(candidate)
            setManualMergeOpen(false)
          }}
        />
      )}

      {mergeCandidate && (
        <MergeConfirmModal
          current={detail.customer}
          candidate={mergeCandidate}
          suggestionId={suggestionId}
          onClose={() => {
            setMergeCandidate(null)
            setSuggestionId(null)
          }}
          onMerged={(id) => {
            setMergeCandidate(null)
            setSuggestionId(null)
            onMergeCompleted(id)
          }}
        />
      )}
    </>
  )
}

function SectionTitle({ title }: { title: string }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h3>
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
      />
    </label>
  )
}

function ReadOnly({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <p className="font-medium text-gray-400">{label}</p>
      <p className="truncate text-gray-700">{value || '—'}</p>
    </div>
  )
}

function ManualMergeModal({
  current,
  onClose,
  onPick,
}: {
  current: CustomerProfile
  onClose: () => void
  onPick: (candidate: CustomerListItem) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CustomerListItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }

    const timer = window.setTimeout(async () => {
      setLoading(true)
      const params = new URLSearchParams({ q: query, per_page: '10' })
      const res = await fetch(`/api/customers?${params.toString()}`)
      if (res.ok) {
        const payload = await res.json() as { data: CustomerListItem[] }
        setResults(payload.data.filter(customer => customer.id !== current.id))
      }
      setLoading(false)
    }, 300)

    return () => window.clearTimeout(timer)
  }, [current.id, query])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button aria-label="Close manual merge" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Merge with another profile</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-700"><X className="h-4 w-4" /></button>
        </div>
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search by name, email, or phone"
            className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
          />
        </div>
        <div className="mt-4 max-h-80 overflow-y-auto">
          {loading ? (
            <p className="py-6 text-center text-sm text-gray-500">Searching…</p>
          ) : results.length > 0 ? results.map(result => (
            <button
              key={result.id}
              onClick={() => onPick(result)}
              className="flex w-full items-center justify-between gap-3 rounded-xl p-3 text-left hover:bg-gray-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{displayName(result.displayName)}</p>
                <p className="truncate text-xs text-gray-400">{result.email || result.phone || result.id}</p>
              </div>
              <div className="flex flex-shrink-0 gap-1">
                {result.channels.map(channel => <ChannelBadge key={channel} channel={channel as Channel} />)}
              </div>
            </button>
          )) : (
            <p className="py-6 text-center text-sm text-gray-500">Search for a profile to merge.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function MergeConfirmModal({
  current,
  candidate,
  suggestionId,
  onClose,
  onMerged,
}: {
  current: CustomerProfile
  candidate: CustomerListItem
  suggestionId: string | null
  onClose: () => void
  onMerged: (id: string) => void
}) {
  const [keepId, setKeepId] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [mergeError, setMergeError] = useState<string | null>(null)

  const currentSummary: CustomerListItem = {
    id: current.id,
    displayName: current.displayName,
    email: current.email,
    phone: current.phone,
    channels: customerChannels(current),
    conversationCount: 0,
    totalOrders: current.totalOrders,
    totalSpend: current.totalSpend,
    lastContactAt: current.lastContactAt,
    hasPendingMergeSuggestion: false,
  }

  const confirm = async () => {
    if (!keepId) return
    setMergeError(null)
    setSubmitting(true)
    try {
      const res = suggestionId
        ? await fetch(`/api/customers/merge-suggestions/${suggestionId}/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keepId }),
          })
        : await fetch('/api/customers/manual-merge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sourceId: keepId === current.id ? candidate.id : current.id,
              targetId: keepId,
            }),
          })

      const payload = await res.json().catch(() => ({})) as { error?: string; survivingCustomerId?: string }
      if (!res.ok) {
        setMergeError(payload.error ?? 'Failed to merge profiles. Please try again.')
        return
      }

      onMerged(payload.survivingCustomerId ?? keepId)
    } catch {
      setMergeError('Failed to merge profiles. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button aria-label="Close merge confirmation" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Confirm merge</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-700"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Choose which profile to keep. The other will be merged into it and permanently removed.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <MergeProfileCard
            profile={currentSummary}
            status={!keepId ? 'idle' : keepId === current.id ? 'keep' : 'remove'}
            onSelect={() => setKeepId(current.id)}
          />
          <MergeProfileCard
            profile={candidate}
            status={!keepId ? 'idle' : keepId === candidate.id ? 'keep' : 'remove'}
            onSelect={() => setKeepId(candidate.id)}
          />
        </div>
        {mergeError && (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {mergeError}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            type="button"
            onClick={confirm}
            disabled={!keepId || submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm merge
          </button>
        </div>
      </div>
    </div>
  )
}

function MergeProfileCard({
  profile,
  status,
  onSelect,
}: {
  profile: CustomerListItem
  status: 'idle' | 'keep' | 'remove'
  onSelect: () => void
}) {
  const selected = status === 'keep'

  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'rounded-xl border p-4 text-left transition',
        status === 'keep' && 'border-indigo-500 bg-indigo-50 ring-4 ring-indigo-50',
        status === 'remove' && 'border-rose-200 bg-rose-50/40 hover:border-rose-300',
        status === 'idle' && 'border-gray-200 hover:border-gray-300'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{displayName(profile.displayName)}</p>
          <p className="mt-1 truncate text-xs text-gray-500">{profile.email || 'No email'}</p>
          <p className="truncate text-xs text-gray-500">{profile.phone || 'No phone'}</p>
        </div>
        {status === 'keep' && (
          <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
            Keep
          </span>
        )}
        {status === 'remove' && (
          <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-600">
            Will be absorbed
          </span>
        )}
        {status === 'idle' && (
          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
            Select
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {profile.channels.length > 0 ? profile.channels.map(channel => <ChannelBadge key={channel} channel={channel as Channel} />) : <span className="text-xs text-gray-400">No channels</span>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-500">
        <p><span className="font-medium text-gray-900">{profile.totalOrders}</span> orders</p>
        <p><span className="font-medium text-gray-900">{formatMoney(profile.totalSpend)}</span> spend</p>
      </div>
    </button>
  )
}
