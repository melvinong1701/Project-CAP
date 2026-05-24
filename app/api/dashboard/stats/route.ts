import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin'
import { requireAuth } from '@/lib/getOrgId'

type DashboardRange = '24h' | '7d' | '30d'

interface MessageRow {
  id: string
  conversation_id: string
  sender: string
  timestamp: string
}

const rangeMs: Record<DashboardRange, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

const confidenceWeights = {
  high: 0.9,
  medium: 0.65,
  low: 0.35,
}

const messagePageSize = 1000

function isDashboardRange(value: string | null): value is DashboardRange {
  return value === '24h' || value === '7d' || value === '30d'
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    if (ctx instanceof NextResponse) return ctx

    const { searchParams } = new URL(req.url)
    const requestedRange = searchParams.get('range') ?? '7d'

    if (!isDashboardRange(requestedRange)) {
      return jsonError('range must be one of 24h, 7d, or 30d', 400)
    }

    const now = Date.now()
    const windowMs = rangeMs[requestedRange]
    const currentStart = new Date(now - windowMs).toISOString()
    const priorStart = new Date(now - windowMs * 2).toISOString()

    const supabase = createSupabaseAdminClient()
    const organizationId = ctx.organizationId

    const [
      currentCount,
      priorCount,
      autoSent,
      drafted,
      escalated,
      avgResponseMin,
    ] = await Promise.all([
      countConversations(supabase, organizationId, currentStart),
      countConversations(supabase, organizationId, priorStart, currentStart),
      countAiConfidence(supabase, organizationId, currentStart, 'high'),
      countAiConfidence(supabase, organizationId, currentStart, 'medium'),
      countAiConfidence(supabase, organizationId, currentStart, 'low'),
      getAverageResponseMinutes(supabase, organizationId, currentStart),
    ])

    const aiAssisted = autoSent + drafted + escalated
    const deltaPct = priorCount === 0 ? 0 : ((currentCount - priorCount) / priorCount) * 100
    const avgConfidence = aiAssisted === 0
      ? 0
      : (
          autoSent * confidenceWeights.high +
          drafted * confidenceWeights.medium +
          escalated * confidenceWeights.low
        ) / aiAssisted

    return NextResponse.json({
      conversations: {
        count: currentCount,
        deltaPct,
      },
      aiPerformance: {
        autoSent,
        drafted,
        escalated,
        aiHandleRate: currentCount === 0 ? 0 : aiAssisted / currentCount,
        avgConfidence,
      },
      avgResponseMin,
    })
  } catch (err) {
    console.error('Dashboard stats GET error:', err)
    return jsonError('Internal error', 500)
  }
}

async function countConversations(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  organizationId: string,
  fromIso: string,
  beforeIso?: string
) {
  let query = supabase
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .gte('created_at', fromIso)

  if (beforeIso) {
    query = query.lt('created_at', beforeIso)
  }

  const { count, error } = await query

  if (error) {
    throw new Error(`Failed to count conversations: ${error.message}`)
  }

  return count ?? 0
}

async function countAiConfidence(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  organizationId: string,
  fromIso: string,
  confidence: keyof typeof confidenceWeights
) {
  const { count, error } = await supabase
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .gte('created_at', fromIso)
    .eq('ai_suggestion->>confidence', confidence)

  if (error) {
    throw new Error(`Failed to count ${confidence} AI suggestions: ${error.message}`)
  }

  return count ?? 0
}

async function getAverageResponseMinutes(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  organizationId: string,
  fromIso: string
) {
  const messages = await fetchMessagesSince(supabase, organizationId, fromIso)
  const firstCustomerAt = new Map<string, number>()
  const firstResponseAt = new Map<string, number>()

  for (const message of messages) {
    const timestamp = new Date(message.timestamp).getTime()

    if (message.sender === 'customer') {
      if (!firstCustomerAt.has(message.conversation_id)) {
        firstCustomerAt.set(message.conversation_id, timestamp)
      }
      continue
    }

    if (message.sender !== 'agent' && message.sender !== 'ai') continue

    const customerTimestamp = firstCustomerAt.get(message.conversation_id)
    if (customerTimestamp === undefined || firstResponseAt.has(message.conversation_id)) {
      continue
    }

    if (timestamp > customerTimestamp) {
      firstResponseAt.set(message.conversation_id, timestamp)
    }
  }

  const responseMinutes = Array.from(firstResponseAt.entries())
    .map(([conversationId, responseTimestamp]) => {
      const customerTimestamp = firstCustomerAt.get(conversationId)
      return customerTimestamp === undefined
        ? null
        : (responseTimestamp - customerTimestamp) / 60000
    })
    .filter((value): value is number => value !== null)

  if (responseMinutes.length === 0) return null

  const total = responseMinutes.reduce((sum, value) => sum + value, 0)
  return total / responseMinutes.length
}

async function fetchMessagesSince(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  organizationId: string,
  fromIso: string
) {
  const messages: MessageRow[] = []

  for (let from = 0; ; from += messagePageSize) {
    const to = from + messagePageSize - 1
    const { data, error } = await supabase
      .from('messages')
      .select('id, conversation_id, sender, timestamp')
      .eq('organization_id', organizationId)
      .gte('timestamp', fromIso)
      .in('sender', ['customer', 'agent', 'ai'])
      .order('timestamp', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
      .returns<MessageRow[]>()

    if (error) {
      throw new Error(`Failed to fetch messages for response timing: ${error.message}`)
    }

    messages.push(...(data ?? []))

    if (!data || data.length < messagePageSize) {
      break
    }
  }

  return messages
}
