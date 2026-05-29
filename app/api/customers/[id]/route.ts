import { NextRequest, NextResponse } from 'next/server'
import { resolveCustomerIdentity } from '@/lib/identity-resolution'
import {
  cleanTags,
  cleanText,
  customerSelect,
  getSupabaseAdmin,
  isUuid,
  mapCustomer,
  type CustomerRow,
  type MergeRow,
  type MergeSuggestionRow,
} from '../_utils'
import { requireAuth } from '@/lib/getOrgId'
import { normalizePhone } from '@/lib/phone'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: { id: string }
}

interface ConversationRow {
  id: string
  channel: string
  store_id: string | null
  last_message: string | null
  last_message_at: string
  is_read: boolean
}

interface StoreRow {
  id: string
  name: string
}

interface OrderRow {
  id: string
  channel: string
  external_order_id: string
  status: string
  items_summary: string | null
  total_amount: number | string | null
  currency: string
  order_placed_at: string | null
  tracking_number: string | null
}

function toMoney(value: number | string | null) {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value) || null
  return null
}

function profileSummary(row: Pick<CustomerRow, 'id' | 'display_name' | 'email' | 'phone'>) {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    phone: row.phone,
  }
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await requireAuth()
    if (ctx instanceof NextResponse) return ctx
    const ORG_ID = ctx.organizationId

    if (!isUuid(params.id)) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const supabase = getSupabaseAdmin()
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select(customerSelect)
      .eq('id', params.id)
      .eq('organization_id', ORG_ID)
      .neq('merge_status', 'merged_into')
      .maybeSingle<CustomerRow>()

    if (customerError) {
      console.error('Customer detail fetch error:', customerError)
      return NextResponse.json({ error: 'Failed to fetch customer' }, { status: 500 })
    }

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const [
      conversationsResult,
      ordersResult,
      suggestionsResult,
      mergeHistoryResult,
    ] = await Promise.all([
      supabase
        .from('conversations')
        .select('id, channel, store_id, last_message, last_message_at, is_read')
        .eq('organization_id', ORG_ID)
        .eq('customer_id', customer.id)
        .order('last_message_at', { ascending: false })
        .returns<ConversationRow[]>(),
      supabase
        .from('customer_orders')
        .select('id, channel, external_order_id, status, items_summary, total_amount, currency, order_placed_at, tracking_number')
        .eq('organization_id', ORG_ID)
        .eq('customer_id', customer.id)
        .order('order_placed_at', { ascending: false })
        .returns<OrderRow[]>(),
      supabase
        .from('customer_merge_suggestions')
        .select('id, organization_id, profile_a_id, profile_b_id, reason, confidence, status, created_at')
        .eq('organization_id', ORG_ID)
        .eq('status', 'pending')
        .or(`profile_a_id.eq.${customer.id},profile_b_id.eq.${customer.id}`)
        .order('created_at', { ascending: false })
        .returns<MergeSuggestionRow[]>(),
      supabase
        .from('customer_merges')
        .select('id, source_id, target_id, merged_by, snapshot, created_at')
        .eq('organization_id', ORG_ID)
        .or(`source_id.eq.${customer.id},target_id.eq.${customer.id}`)
        .order('created_at', { ascending: false })
        .returns<MergeRow[]>(),
    ])

    if (conversationsResult.error || ordersResult.error || suggestionsResult.error || mergeHistoryResult.error) {
      console.error('Customer detail related fetch error:', {
        conversations: conversationsResult.error,
        orders: ordersResult.error,
        suggestions: suggestionsResult.error,
        merges: mergeHistoryResult.error,
      })
      return NextResponse.json({ error: 'Failed to fetch customer details' }, { status: 500 })
    }

    const conversations = conversationsResult.data ?? []
    const storeIds = Array.from(new Set(conversations.map(row => row.store_id).filter((id): id is string => Boolean(id))))
    const otherProfileIds = Array.from(new Set((suggestionsResult.data ?? []).map(row => row.profile_a_id === customer.id ? row.profile_b_id : row.profile_a_id)))
    const absorbedTargetIds = Array.from(new Set((mergeHistoryResult.data ?? []).filter(row => row.source_id === customer.id).map(row => row.target_id)))

    const [storesResult, otherProfilesResult, absorbedTargetsResult] = await Promise.all([
      storeIds.length
        ? supabase
            .from('stores')
            .select('id, name')
            .eq('organization_id', ORG_ID)
            .in('id', storeIds)
            .returns<StoreRow[]>()
        : Promise.resolve({ data: [] as StoreRow[], error: null }),
      otherProfileIds.length
        ? supabase
            .from('customers')
            .select(customerSelect)
            .eq('organization_id', ORG_ID)
            .neq('merge_status', 'merged_into')
            .in('id', otherProfileIds)
            .returns<CustomerRow[]>()
        : Promise.resolve({ data: [] as CustomerRow[], error: null }),
      absorbedTargetIds.length
        ? supabase
            .from('customers')
            .select(customerSelect)
            .eq('organization_id', ORG_ID)
            .in('id', absorbedTargetIds)
            .returns<CustomerRow[]>()
        : Promise.resolve({ data: [] as CustomerRow[], error: null }),
    ])

    if (storesResult.error || otherProfilesResult.error || absorbedTargetsResult.error) {
      console.error('Customer detail secondary fetch error:', {
        stores: storesResult.error,
        profiles: otherProfilesResult.error,
        absorbedTargets: absorbedTargetsResult.error,
      })
      return NextResponse.json({ error: 'Failed to fetch customer details' }, { status: 500 })
    }

    const storesById = new Map((storesResult.data ?? []).map(store => [store.id, store.name]))
    const profilesById = new Map((otherProfilesResult.data ?? []).map(profile => [profile.id, profile]))
    const absorbedTargetsById = new Map((absorbedTargetsResult.data ?? []).map(profile => [profile.id, profile]))

    return NextResponse.json({
      customer: mapCustomer(customer),
      conversations: conversations.map(conversation => ({
        id: conversation.id,
        channel: conversation.channel,
        storeName: conversation.store_id ? storesById.get(conversation.store_id) ?? 'Unknown store' : 'Unknown store',
        lastMessage: conversation.last_message,
        lastMessageAt: conversation.last_message_at,
        isRead: conversation.is_read,
      })),
      orders: (ordersResult.data ?? []).map(order => ({
        id: order.id,
        channel: order.channel,
        externalOrderId: order.external_order_id,
        status: order.status,
        itemsSummary: order.items_summary,
        totalAmount: toMoney(order.total_amount),
        currency: order.currency,
        orderPlacedAt: order.order_placed_at,
        trackingNumber: order.tracking_number,
      })),
      mergeSuggestions: (suggestionsResult.data ?? []).map(suggestion => ({
        id: suggestion.id,
        otherProfile: profileSummary(profilesById.get(suggestion.profile_a_id === customer.id ? suggestion.profile_b_id : suggestion.profile_a_id) ?? {
          id: suggestion.profile_a_id === customer.id ? suggestion.profile_b_id : suggestion.profile_a_id,
          display_name: null,
          email: null,
          phone: null,
        }),
        reason: suggestion.reason,
        confidence: suggestion.confidence,
        createdAt: suggestion.created_at,
      })),
      mergeHistory: (mergeHistoryResult.data ?? []).map(merge => {
        const direction = merge.source_id === customer.id ? 'absorbed' : 'absorber'
        const target = absorbedTargetsById.get(merge.target_id)
        return {
          id: merge.id,
          direction,
          otherProfileSnapshot: direction === 'absorbed' && target ? mapCustomer(target) : merge.snapshot,
          mergedBy: merge.merged_by,
          createdAt: merge.created_at,
        }
      }),
    })
  } catch (err) {
    console.error('Customer detail GET error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await requireAuth()
    if (ctx instanceof NextResponse) return ctx
    const ORG_ID = ctx.organizationId

    if (!isUuid(params.id)) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const body = await req.json() as Record<string, unknown>
    const supabase = getSupabaseAdmin()
    const { data: updatedCustomer, error: updateError } = await supabase
      .from('customers')
      .update({
        display_name: cleanText(body.displayName),
        email: cleanText(body.email),
        phone: normalizePhone(cleanText(body.phone) ?? undefined),
        notes: cleanText(body.notes),
        tags: cleanTags(body.tags),
      })
      .eq('id', params.id)
      .eq('organization_id', ORG_ID)
      .neq('merge_status', 'merged_into')
      .select(customerSelect)
      .maybeSingle<CustomerRow>()

    if (updateError) {
      console.error('Customer update error:', updateError)
      return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 })
    }

    if (!updatedCustomer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const resolution = await resolveCustomerIdentity({
      supabase,
      organizationId: ORG_ID,
      customerId: updatedCustomer.id,
    })

    const { data: resolvedCustomer, error: resolvedError } = await supabase
      .from('customers')
      .select(customerSelect)
      .eq('id', resolution.customerId)
      .eq('organization_id', ORG_ID)
      .maybeSingle<CustomerRow>()

    if (resolvedError || !resolvedCustomer) {
      console.error('Customer post-update resolution fetch error:', resolvedError)
      return NextResponse.json({ error: 'Failed to fetch updated customer' }, { status: 500 })
    }

    return NextResponse.json({ customer: mapCustomer(resolvedCustomer) })
  } catch (err) {
    console.error('Customer PUT error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
