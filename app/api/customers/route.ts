import { NextRequest, NextResponse } from 'next/server'
import {
  ORG_ID,
  compactSearchTerm,
  customerSelect,
  getSupabaseAdmin,
  mapCustomerSummary,
  type CustomerRow,
  type MergeSuggestionRow,
} from './_utils'

export const dynamic = 'force-dynamic'

const channelColumns: Record<string, keyof Pick<CustomerRow, 'telegram_id' | 'shopee_buyer_id' | 'lazada_buyer_id' | 'tiktok_buyer_id'>> = {
  telegram: 'telegram_id',
  shopee: 'shopee_buyer_id',
  lazada: 'lazada_buyer_id',
  tiktok_shop: 'tiktok_buyer_id',
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = compactSearchTerm(searchParams.get('q') ?? '')
    const channel = searchParams.get('channel')
    const hasOrders = searchParams.get('has_orders')
    const page = Math.max(Number(searchParams.get('page') ?? '1') || 1, 1)
    const perPage = Math.min(Math.max(Number(searchParams.get('per_page') ?? '50') || 50, 1), 100)
    const from = (page - 1) * perPage
    const to = from + perPage - 1

    const supabase = getSupabaseAdmin()
    let query = supabase
      .from('customers')
      .select(customerSelect, { count: 'exact' })
      .eq('organization_id', ORG_ID)
      .neq('merge_status', 'merged_into')

    if (q) {
      const pattern = `*${q}*`
      query = query.or([
        `display_name.ilike.${pattern}`,
        `email.ilike.${pattern}`,
        `phone.ilike.${pattern}`,
        `telegram_id.ilike.${pattern}`,
        `shopee_buyer_id.ilike.${pattern}`,
        `lazada_buyer_id.ilike.${pattern}`,
        `tiktok_buyer_id.ilike.${pattern}`,
      ].join(','))
    }

    if (channel && channelColumns[channel]) {
      query = query.not(channelColumns[channel], 'is', null)
    }

    if (hasOrders === 'true') query = query.gt('total_orders', 0)
    if (hasOrders === 'false') query = query.eq('total_orders', 0)

    const { data: customers, error, count } = await query
      .order('last_contact_at', { ascending: false })
      .range(from, to)
      .returns<CustomerRow[]>()

    if (error) {
      console.error('Customers list error:', error)
      return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 })
    }

    const customerIds = (customers ?? []).map(customer => customer.id)
    const conversationCounts = new Map<string, number>()

    if (customerIds.length > 0) {
      const { data: conversations, error: conversationsError } = await supabase
        .from('conversations')
        .select('customer_id')
        .eq('organization_id', ORG_ID)
        .in('customer_id', customerIds)
        .returns<{ customer_id: string | null }[]>()

      if (conversationsError) {
        console.error('Customers conversation count error:', conversationsError)
        return NextResponse.json({ error: 'Failed to fetch customer conversation counts' }, { status: 500 })
      }

      ;(conversations ?? []).forEach(row => {
        if (!row.customer_id) return
        conversationCounts.set(row.customer_id, (conversationCounts.get(row.customer_id) ?? 0) + 1)
      })
    }

    const pendingProfiles = new Set<string>()
    const { data: pendingSuggestions, error: suggestionsError } = await supabase
      .from('customer_merge_suggestions')
      .select('profile_a_id, profile_b_id')
      .eq('organization_id', ORG_ID)
      .eq('status', 'pending')
      .returns<Pick<MergeSuggestionRow, 'profile_a_id' | 'profile_b_id'>[]>()

    if (suggestionsError) {
      console.error('Customers pending suggestion error:', suggestionsError)
      return NextResponse.json({ error: 'Failed to fetch pending merge suggestions' }, { status: 500 })
    }

    ;(pendingSuggestions ?? []).forEach(suggestion => {
      pendingProfiles.add(suggestion.profile_a_id)
      pendingProfiles.add(suggestion.profile_b_id)
    })

    return NextResponse.json({
      data: (customers ?? []).map(customer => mapCustomerSummary(customer, {
        conversationCount: conversationCounts.get(customer.id) ?? 0,
        hasPendingMergeSuggestion: pendingProfiles.has(customer.id),
      })),
      total: count ?? 0,
      page,
      perPage,
    })
  } catch (err) {
    console.error('Customers GET error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
