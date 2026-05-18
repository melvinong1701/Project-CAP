'use client'
import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { ConversationList } from '@/components/ConversationList'
import { ConversationDetail } from '@/components/ConversationDetail'
import { supabase } from '@/lib/supabase'
import { AiConfidence, Conversation, CustomerContact, Message, Store, isAiError } from '@/lib/types'
import { X, Loader2, Check, AlertCircle } from 'lucide-react'

const ORG_ID = '00000000-0000-0000-0000-000000000001'

// ─── Supabase row shapes ────────────────────────────────────────────────────

interface ConvRow {
  id: string
  organization_id: string
  customer_id: string | null
  store_id: string | null
  channel: string
  external_id: string
  sender_name: string
  sender_avatar: string | null
  last_message: string | null
  last_message_at: string
  is_read: boolean
  ai_suggestion:
    | { text: string; confidence: string; autoSent: boolean; dismissed?: boolean }
    | { error: string; dismissed: false }
    | null
  tags: string[] | null
  assigned_to: string | null
}

interface CustomerRow {
  id: string
  organization_id: string
  display_name: string | null
  email: string | null
  phone: string | null
  notes: string | null
  telegram_id: string | null
  shopee_buyer_id: string | null
  lazada_buyer_id: string | null
  tiktok_buyer_id: string | null
}

interface MsgRow {
  id: string
  organization_id: string
  conversation_id: string
  sender: string
  content: string
  timestamp: string
  external_id: string | null
}

interface StorePlatformRow {
  store_id: string
  platform_id: string
  account_label: string | null
}

interface StoreRow {
  id: string
  name: string
}

type SuggestResponse = { data?: { text: string; confidence: string }; error?: string }

// ─── Mappers ────────────────────────────────────────────────────────────────

function mapConv(row: ConvRow, messages: Message[] = []): Conversation {
  return {
    id: row.id,
    organizationId: row.organization_id,
    customerId: row.customer_id ?? undefined,
    channel: row.channel as Conversation['channel'],
    externalId: row.external_id,
    sender: { name: row.sender_name, avatarUrl: row.sender_avatar ?? undefined },
    storeName: '',   // filled in by the caller
    storeId: row.store_id ?? '',
    lastMessage: row.last_message ?? '',
    lastMessageAt: new Date(row.last_message_at),
    isRead: row.is_read,
    messages,
    aiSuggestion: mapAiSuggestion(row.ai_suggestion),
    tags: row.tags ?? [],
    assignedTo: row.assigned_to ?? undefined,
  }
}

function mapCustomer(row: CustomerRow): CustomerContact {
  return {
    id: row.id,
    organizationId: row.organization_id,
    displayName: row.display_name ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    notes: row.notes ?? undefined,
    telegramId: row.telegram_id ?? undefined,
    shopeeBuyerId: row.shopee_buyer_id ?? undefined,
    lazadaBuyerId: row.lazada_buyer_id ?? undefined,
    tiktokBuyerId: row.tiktok_buyer_id ?? undefined,
  }
}

function mapAiSuggestion(row: ConvRow['ai_suggestion']): Conversation['aiSuggestion'] {
  if (!row) return undefined
  if ('error' in row) return { error: row.error, dismissed: false as const }
  return {
    text: row.text,
    confidence: row.confidence as AiConfidence,
    autoSent: row.autoSent,
    dismissed: row.dismissed ?? false,
  }
}

function normalizeAiErrorCode(error: string | undefined): string {
  return error === 'timeout' || error === 'no_messages' ? error : 'pipeline_error'
}

function mapMsg(row: MsgRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    sender: row.sender as Message['sender'],
    content: row.content,
    timestamp: new Date(row.timestamp),
  }
}

// ─── Telegram Quick-Connect Modal ────────────────────────────────────────────

interface TelegramSetupModalProps {
  existingStores: { id: string; name: string }[]
  onClose: () => void
  onDone: () => void | Promise<void>
}

type SetupStep = 'store' | 'token' | 'connecting' | 'done' | 'error'

function TelegramSetupModal({ existingStores, onClose, onDone }: TelegramSetupModalProps) {
  const [step, setStep] = useState<SetupStep>(existingStores.length > 0 ? 'token' : 'store')
  const [storeName, setStoreName] = useState('')
  const [selectedStoreId, setSelectedStoreId] = useState(existingStores[0]?.id ?? '')
  const [botToken, setBotToken] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [connectedAccount, setConnectedAccount] = useState('')

  const handleConnect = async () => {
    if (!botToken.trim()) return
    setStep('connecting')
    setErrorMsg('')

    let storeId = selectedStoreId

    // Create a store first if needed
    if (!storeId) {
      const name = storeName.trim() || 'My Store'
      const { data, error } = await supabase
        .from('stores')
        .insert({ name, organization_id: ORG_ID, country: 'SG', language: 'en', currency: 'SGD' })
        .select('id')
        .single()
      if (error || !data) {
        setErrorMsg('Failed to create store — please try again')
        setStep('error')
        return
      }
      storeId = data.id
    }

    try {
      const res = await fetch('/api/telegram/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: botToken.trim(), storeId }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; accountLabel?: string }
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error ?? 'Connection failed — check your token and try again')
        setStep('error')
        return
      }
      setConnectedAccount(data.accountLabel ?? '@bot')
      setStep('done')
    } catch {
      setErrorMsg('Network error — please try again')
      setStep('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={step !== 'connecting' ? onClose : undefined} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 flex flex-col gap-5">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">T</span>
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">Connect Telegram bot</p>
              <p className="text-xs text-gray-400 mt-0.5">Messages from your bot will appear here</p>
            </div>
          </div>
          {step !== 'connecting' && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Step: store name (only if no stores exist) */}
        {step === 'store' && (
          <>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Store name</label>
              <input
                type="text"
                value={storeName}
                onChange={e => setStoreName(e.target.value)}
                placeholder="e.g. TechGear SG"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent placeholder:text-gray-300"
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-1.5">You can rename or add more stores in Settings later.</p>
            </div>
            <button
              onClick={() => setStep('token')}
              disabled={!storeName.trim()}
              className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold transition-colors"
            >
              Next →
            </button>
          </>
        )}

        {/* Step: store picker (if stores already exist) + token */}
        {step === 'token' && (
          <>
            {existingStores.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Connect to store</label>
                <select
                  value={selectedStoreId}
                  onChange={e => setSelectedStoreId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent bg-white"
                >
                  {existingStores.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Bot token from @BotFather</label>
              <input
                type="text"
                value={botToken}
                onChange={e => setBotToken(e.target.value)}
                placeholder="1234567890:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent placeholder:text-gray-300"
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-1.5">Open Telegram → @BotFather → /newbot → copy the token.</p>
            </div>
            <div className="flex items-start gap-2 text-xs text-gray-500 bg-sky-50 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 text-sky-500 flex-shrink-0 mt-0.5" />
              <p>The token is stored securely. We use it only to receive and send messages on your behalf.</p>
            </div>
            <div className="flex gap-3">
              {!existingStores.length && (
                <button onClick={() => setStep('store')} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">
                  ← Back
                </button>
              )}
              <button
                onClick={handleConnect}
                disabled={!botToken.trim()}
                className="flex-1 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold transition-colors"
              >
                Connect bot
              </button>
            </div>
          </>
        )}

        {step === 'connecting' && (
          <div className="flex flex-col items-center py-8 gap-4">
            <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
            <p className="text-sm text-gray-500">Verifying token and registering webhook…</p>
          </div>
        )}

        {step === 'error' && (
          <>
            <div className="flex flex-col items-center py-4 gap-3">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <X className="w-6 h-6 text-red-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-gray-900 text-sm">Connection failed</p>
                <p className="text-xs text-gray-400 mt-1">{errorMsg}</p>
              </div>
            </div>
            <button onClick={() => setStep('token')} className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold transition-colors">
              Try again
            </button>
          </>
        )}

        {step === 'done' && (
          <>
            <div className="flex flex-col items-center py-4 gap-3">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-gray-900 text-sm">Bot connected!</p>
                <p className="text-xs text-gray-500 mt-1">{connectedAccount} is live. Send your bot a message to test it.</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-600">
              Messages sent to your Telegram bot will now appear in this inbox in real time.
            </div>
            <button onClick={async () => { await onDone(); onClose() }} className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold transition-colors">
              Done
            </button>
          </>
        )}

      </div>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function Home() {
  const [requestedConversationId] = useState(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get('conversationId')
  })
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [storeNames, setStoreNames] = useState<Record<string, string>>({})
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [showTelegramSetup, setShowTelegramSetup] = useState(false)
  // Raw store list for the quick-connect modal (id + name pairs)
  const [rawStores, setRawStores] = useState<{ id: string; name: string }[]>([])

  // ── Fetch all conversations + their messages ──────────────────────────────
  const fetchConversations = useCallback(async () => {
    const { data: convRows, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('organization_id', ORG_ID)
      .order('last_message_at', { ascending: false })

    if (error || !convRows) return

    // Fetch messages for all conversations in one query
    const convIds = convRows.map((r: ConvRow) => r.id)
    const { data: msgRows } = convIds.length
      ? await supabase
          .from('messages')
          .select('*')
          .eq('organization_id', ORG_ID)
          .in('conversation_id', convIds)
          .order('timestamp', { ascending: true })
      : { data: [] as MsgRow[] }

    const msgsByConv: Record<string, Message[]> = {}
    ;(msgRows ?? []).forEach((m: MsgRow) => {
      if (!msgsByConv[m.conversation_id]) msgsByConv[m.conversation_id] = []
      msgsByConv[m.conversation_id].push(mapMsg(m))
    })

    const customerIds = convRows
      .map((r: ConvRow) => r.customer_id)
      .filter((id: string | null): id is string => Boolean(id))

    const { data: customerRows } = customerIds.length
      ? await supabase
          .from('customers')
          .select('id, organization_id, display_name, email, phone, notes, telegram_id, shopee_buyer_id, lazada_buyer_id, tiktok_buyer_id')
          .eq('organization_id', ORG_ID)
          .in('id', customerIds)
      : { data: [] as CustomerRow[] }

    const customersById: Record<string, CustomerContact> = {}
    ;(customerRows ?? []).forEach((customer: CustomerRow) => {
      customersById[customer.id] = mapCustomer(customer)
    })

    const mapped = convRows.map((r: ConvRow) => {
      const c = mapConv(r, msgsByConv[r.id] ?? [])
      c.storeName = storeNames[r.store_id ?? ''] ?? 'Telegram'
      c.customer = r.customer_id ? customersById[r.customer_id] : undefined
      return c
    })

    setConversations(mapped)
    if (requestedConversationId && mapped.some((conversation: Conversation) => conversation.id === requestedConversationId)) {
      setActiveConvId(requestedConversationId)
    } else if (!activeConvId && mapped.length > 0) {
      setActiveConvId(mapped[0].id)
    }
    setLoading(false)
  }, [storeNames, activeConvId, requestedConversationId])

  // ── Fetch stores for sidebar ──────────────────────────────────────────────
  const fetchStores = useCallback(async () => {
    const { data: storeRows } = await supabase
      .from('stores')
      .select('id, name')
      .eq('organization_id', ORG_ID)

    const storeIds = (storeRows ?? []).map((s: StoreRow) => s.id)
    const { data: platformRows } = storeIds.length
      ? await supabase
          .from('store_platforms')
          .select('store_id, platform_id, account_label')
          .in('store_id', storeIds)
      : { data: [] as StorePlatformRow[] }

    const names: Record<string, string> = {}
    ;(storeRows ?? []).forEach((s: StoreRow) => { names[s.id] = s.name })
    setStoreNames(names)
    setRawStores((storeRows ?? []).map((s: StoreRow) => ({ id: s.id, name: s.name })))

    // Build sidebar stores from store_platforms (one entry per connected channel per store)
    const sidebarStores: Store[] = (platformRows ?? []).map((p: StorePlatformRow) => ({
      id: `${p.store_id}:${p.platform_id}`,
      name: names[p.store_id] ?? p.account_label ?? 'Store',
      channel: p.platform_id as Store['channel'],
      unreadCount: 0,
    }))

    setStores(sidebarStores)
  }, [])

  useEffect(() => {
    fetchStores()
  }, [fetchStores])

  // ── Load conversations once storeNames are ready ──────────────────────────
  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  // ── Supabase Realtime — new messages ──────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('realtime:messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `organization_id=eq.${ORG_ID}` },
        (payload) => {
          const newMsg = mapMsg(payload.new as MsgRow)
          setConversations(prev =>
            prev.map(c => {
              if (c.id !== newMsg.conversationId) return c
              const optimisticIndex = c.messages.findIndex(m => {
                const isSameDirection =
                  (m.sender === newMsg.sender) ||
                  (m.sender === 'ai' && newMsg.sender === 'agent')
                const isRecent = Math.abs(m.timestamp.getTime() - newMsg.timestamp.getTime()) < 15000
                return m.id.startsWith('msg-') && isSameDirection && m.content === newMsg.content && isRecent
              })
              if (optimisticIndex >= 0) {
                const nextMessages = [...c.messages]
                nextMessages[optimisticIndex] = newMsg
                return {
                  ...c,
                  messages: nextMessages,
                  lastMessage: newMsg.content,
                  lastMessageAt: newMsg.timestamp,
                  isRead: newMsg.sender === 'agent' ? c.isRead : false,
                }
              }
              if (c.messages.some(m => m.id === newMsg.id)) return c
              return {
                ...c,
                messages: [...c.messages, newMsg],
                lastMessage: newMsg.content,
                lastMessageAt: newMsg.timestamp,
                isRead: newMsg.sender === 'agent' ? c.isRead : false,
              }
            })
          )
          if ((payload.new as MsgRow).sender === 'customer') {
            const convId = (payload.new as MsgRow).conversation_id
            fetch('/api/ai/suggest', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ conversationId: convId }),
            })
              .then(r => r.json())
              .then((res: SuggestResponse) => {
                if (res.data) {
                  setConversations(prev =>
                    prev.map(c =>
                      c.id === convId
                        ? { ...c, aiSuggestion: { text: res.data!.text, confidence: res.data!.confidence as 'high' | 'medium' | 'low', autoSent: false, dismissed: false } }
                        : c
                    )
                  )
                } else {
                  const errorCode = normalizeAiErrorCode(res.error)
                  setConversations(prev =>
                    prev.map(c =>
                      c.id === convId ? { ...c, aiSuggestion: { error: errorCode, dismissed: false as const } } : c
                    )
                  )
                  supabase
                    .from('conversations')
                    .update({ ai_suggestion: { error: errorCode, dismissed: false } })
                    .eq('id', convId)
                    .eq('organization_id', ORG_ID)
                    .then(() => {})
                }
              })
              .catch(() => {
                const errorCode = 'pipeline_error'
                setConversations(prev =>
                  prev.map(c =>
                    c.id === convId ? { ...c, aiSuggestion: { error: errorCode, dismissed: false as const } } : c
                  )
                )
                supabase
                  .from('conversations')
                  .update({ ai_suggestion: { error: errorCode, dismissed: false } })
                  .eq('id', convId)
                  .eq('organization_id', ORG_ID)
                  .then(() => {})
              })
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations', filter: `organization_id=eq.${ORG_ID}` },
        () => {
          // New conversation arrived — re-fetch to get full data
          fetchConversations()
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `organization_id=eq.${ORG_ID}` },
        (payload) => {
          const updated = payload.new as ConvRow
          setConversations(prev =>
            prev.map(c =>
              c.id === updated.id
                ? {
                    ...c,
                    lastMessage: updated.last_message ?? c.lastMessage,
                    lastMessageAt: new Date(updated.last_message_at),
                    isRead: updated.is_read,
                    customerId: updated.customer_id ?? c.customerId,
                    aiSuggestion: mapAiSuggestion(updated.ai_suggestion),
                  }
                : c
            )
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchConversations])

  // ── Unread counts for sidebar ─────────────────────────────────────────────
  const storesWithCounts = stores.map(store => {
    const storeId = store.id.split(':')[0]
    return {
      ...store,
      unreadCount: conversations.filter(c => c.storeId === storeId && !c.isRead).length,
    }
  })
  const hasConnectedChannels = stores.length > 0

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filteredConversations = conversations.filter(c => {
    if (activeFilter === 'unread') return !c.isRead
    if (activeFilter === 'assigned') return c.assignedTo === 'You'
    if (activeFilter === 'snoozed') return false
    if (activeFilter.startsWith('store:')) {
      const filterStoreId = activeFilter.replace('store:', '').split(':')[0]
      return c.storeId === filterStoreId
    }
    return true
  })

  const activeConv = conversations.find(c => c.id === activeConvId) ?? null

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSelect = async (id: string) => {
    setActiveConvId(id)
    setConversations(prev => prev.map(c => c.id === id ? { ...c, isRead: true } : c))
    await supabase.from('conversations').update({ is_read: true }).eq('id', id).eq('organization_id', ORG_ID)
  }

  const handleMarkRead = async (id: string) => {
    setConversations(prev => prev.map(c => c.id === id ? { ...c, isRead: true } : c))
    await supabase.from('conversations').update({ is_read: true }).eq('id', id).eq('organization_id', ORG_ID)
  }

  const handleSendMessage = async (convId: string, message: Message) => {
    // Optimistically update UI
    setConversations(prev =>
      prev.map(c => {
        if (c.id !== convId) return c
        return {
          ...c,
          messages: [...c.messages, message],
          lastMessage: message.content,
          lastMessageAt: message.timestamp,
          isRead: true,
          aiSuggestion: undefined,
        }
      })
    )

    // Find the conversation to determine channel
    const conv = conversations.find(c => c.id === convId)
    if (!conv) return

    if (conv.channel === 'telegram') {
      // Send via Telegram and persist via the API route
      await fetch('/api/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: convId, text: message.content }),
      })
    }

    await supabase
      .from('conversations')
      .update({ ai_suggestion: null })
      .eq('id', convId)
      .eq('organization_id', ORG_ID)
  }

  const handleClearAi = async (convId: string) => {
    setConversations(prev =>
      prev.map(c => c.id === convId ? { ...c, aiSuggestion: undefined } : c)
    )
    await supabase
      .from('conversations')
      .update({ ai_suggestion: null })
      .eq('id', convId)
      .eq('organization_id', ORG_ID)
  }

  const handleDismissAi = async (convId: string) => {
    setConversations(prev =>
      prev.map(c =>
        c.id === convId && c.aiSuggestion && !isAiError(c.aiSuggestion)
          ? { ...c, aiSuggestion: { ...c.aiSuggestion, dismissed: true } }
          : c
      )
    )
    const conv = conversations.find(c => c.id === convId)
    if (!conv?.aiSuggestion || isAiError(conv.aiSuggestion)) return
    await supabase
      .from('conversations')
      .update({
        ai_suggestion: {
          text: conv.aiSuggestion.text,
          confidence: conv.aiSuggestion.confidence,
          autoSent: conv.aiSuggestion.autoSent,
          dismissed: true,
        },
      })
      .eq('id', convId)
      .eq('organization_id', ORG_ID)
  }

  const handleShowAi = async (convId: string) => {
    setConversations(prev =>
      prev.map(c =>
        c.id === convId && c.aiSuggestion && !isAiError(c.aiSuggestion)
          ? { ...c, aiSuggestion: { ...c.aiSuggestion, dismissed: false } }
          : c
      )
    )
    const conv = conversations.find(c => c.id === convId)
    if (!conv?.aiSuggestion || isAiError(conv.aiSuggestion)) return
    await supabase
      .from('conversations')
      .update({
        ai_suggestion: {
          text: conv.aiSuggestion.text,
          confidence: conv.aiSuggestion.confidence,
          autoSent: conv.aiSuggestion.autoSent,
          dismissed: false,
        },
      })
      .eq('id', convId)
      .eq('organization_id', ORG_ID)
  }

  const handleRetryAi = (convId: string) => {
    setConversations(prev =>
      prev.map(c => c.id === convId ? { ...c, aiSuggestion: undefined } : c)
    )
    fetch('/api/ai/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: convId }),
    })
      .then(r => r.json())
      .then((res: SuggestResponse) => {
        if (res.data) {
          setConversations(prev =>
            prev.map(c =>
              c.id === convId
                ? {
                    ...c,
                    aiSuggestion: {
                      text: res.data!.text,
                      confidence: res.data!.confidence as AiConfidence,
                      autoSent: false,
                      dismissed: false,
                    },
                  }
                : c
            )
          )
        }
      })
      .catch(() => {})
  }

  const handleUpdateCustomer = (convId: string, customer: CustomerContact) => {
    setConversations(prev =>
      prev.map(c =>
        c.id === convId
          ? { ...c, customerId: customer.id, customer }
          : c
      )
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex overflow-hidden bg-white" style={{ height: '100dvh' }}>

      {/* Telegram quick-connect modal */}
      {showTelegramSetup && (
        <TelegramSetupModal
          existingStores={rawStores}
          onClose={() => setShowTelegramSetup(false)}
          onDone={async () => {
            // Refresh stores + conversations after connecting
            setLoading(true)
            await fetchStores()
            await fetchConversations()
          }}
        />
      )}

      <Sidebar
        stores={storesWithCounts}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
      />
      <ConversationList
        conversations={filteredConversations}
        activeId={activeConvId}
        onSelect={handleSelect}
      />
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Loading conversations…
        </div>
      ) : activeConv ? (
        <ConversationDetail
          key={activeConv.id}
          conversation={activeConv}
          onMarkRead={handleMarkRead}
          onSendMessage={handleSendMessage}
          onDismissAi={handleDismissAi}
          onShowAi={handleShowAi}
          onClearAi={handleClearAi}
          onRetryAi={handleRetryAi}
          onUpdateCustomer={handleUpdateCustomer}
        />
      ) : conversations.length === 0 ? (
        /* ── Empty state: no conversations yet ── */
        hasConnectedChannels ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
            <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center">
              <span className="text-3xl">✅</span>
            </div>
            <div className="text-center max-w-xs">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Bot connected!</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Send a message to your Telegram bot — it will appear here in real time.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
            <div className="w-16 h-16 rounded-2xl bg-sky-50 flex items-center justify-center">
              <span className="text-3xl">💬</span>
            </div>
            <div className="text-center max-w-xs">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">No messages yet</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Connect a Telegram bot to start receiving customer messages in real time.
              </p>
            </div>
            <button
              onClick={() => setShowTelegramSetup(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold transition-colors shadow-sm"
            >
              <span className="text-base leading-none">T</span>
              Connect Telegram bot
            </button>
            <p className="text-xs text-gray-300">
              More channels (Shopee, Lazada, TikTok Shop) coming soon
            </p>
          </div>
        )
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Select a conversation
        </div>
      )}
    </div>
  )
}
