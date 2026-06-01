import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/getOrgId'
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

interface ConversationRow {
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
  status: string
  ai_suggestion: unknown
  tags: string[] | null
  assigned_to: string | null
}

interface MessageRow {
  id: string
  organization_id: string
  conversation_id: string
  sender: string
  content: string
  timestamp: string
  external_id: string | null
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

export async function GET() {
  try {
    const ctx = await requireAuth()
    if (ctx instanceof NextResponse) return ctx

    const supabase = createSupabaseAdminClient()
    const { data: conversations, error: conversationsError } = await supabase
      .from('conversations')
      .select('id, organization_id, customer_id, store_id, channel, external_id, sender_name, sender_avatar, last_message, last_message_at, is_read, status, ai_suggestion, tags, assigned_to')
      .eq('organization_id', ctx.organizationId)
      .order('last_message_at', { ascending: false })
      .returns<ConversationRow[]>()

    if (conversationsError) {
      console.error('Conversations list error:', conversationsError)
      return NextResponse.json({ data: null, error: 'Failed to fetch conversations' }, { status: 500 })
    }

    const conversationRows = conversations ?? []
    const conversationIds = conversationRows.map(conversation => conversation.id)
    const customerIds = Array.from(new Set(
      conversationRows
        .map(conversation => conversation.customer_id)
        .filter((id): id is string => Boolean(id))
    ))

    const [messagesResult, customersResult] = await Promise.all([
      conversationIds.length > 0
        ? supabase
            .from('messages')
            .select('id, organization_id, conversation_id, sender, content, timestamp, external_id')
            .eq('organization_id', ctx.organizationId)
            .in('conversation_id', conversationIds)
            .order('timestamp', { ascending: true })
            .returns<MessageRow[]>()
        : Promise.resolve({ data: [] as MessageRow[], error: null }),
      customerIds.length > 0
        ? supabase
            .from('customers')
            .select('id, organization_id, display_name, email, phone, notes, telegram_id, shopee_buyer_id, lazada_buyer_id, tiktok_buyer_id')
            .eq('organization_id', ctx.organizationId)
            .in('id', customerIds)
            .returns<CustomerRow[]>()
        : Promise.resolve({ data: [] as CustomerRow[], error: null }),
    ])

    if (messagesResult.error || customersResult.error) {
      console.error('Conversations related rows error:', {
        messages: messagesResult.error,
        customers: customersResult.error,
      })
      return NextResponse.json({ data: null, error: 'Failed to fetch conversation details' }, { status: 500 })
    }

    return NextResponse.json({
      data: {
        organizationId: ctx.organizationId,
        conversations: conversationRows,
        messages: messagesResult.data ?? [],
        customers: customersResult.data ?? [],
      },
      error: null,
    })
  } catch (err) {
    console.error('Conversations GET error:', err)
    return NextResponse.json({ data: null, error: 'Internal error' }, { status: 500 })
  }
}
