import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/getOrgId'
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: { id: string }
}

interface ConversationRow {
  customer_id: string | null
}

interface CustomerRow {
  id: string
  total_orders: number | string | null
  total_spend: number | string | null
}

interface OrderRow {
  id: string
  channel: string
  external_order_id: string
  order_reference: string | null
  status: string
  items_summary: string | null
  total_amount: number | string | null
  currency: string
  order_placed_at: string | null
  tracking_number: string | null
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value) || 0
  return 0
}

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const ctx = await requireAuth()
    if (ctx instanceof NextResponse) return ctx

    const supabase = createSupabaseAdminClient()
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('customer_id')
      .eq('id', params.id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle<ConversationRow>()

    if (conversationError) {
      console.error('Conversation orders lookup error:', conversationError)
      return NextResponse.json({ error: 'Failed to fetch conversation' }, { status: 500 })
    }

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    if (!conversation.customer_id) {
      return NextResponse.json({ orders: [], customer: null })
    }

    const [customerResult, ordersResult] = await Promise.all([
      supabase
        .from('customers')
        .select('id, total_orders, total_spend')
        .eq('id', conversation.customer_id)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle<CustomerRow>(),
      supabase
        .from('customer_orders')
        .select('id, channel, external_order_id, order_reference, status, items_summary, total_amount, currency, order_placed_at, tracking_number')
        .eq('organization_id', ctx.organizationId)
        .eq('customer_id', conversation.customer_id)
        .order('order_placed_at', { ascending: false, nullsFirst: false })
        .limit(10)
        .returns<OrderRow[]>(),
    ])

    if (customerResult.error || ordersResult.error) {
      console.error('Conversation orders related fetch error:', {
        customer: customerResult.error,
        orders: ordersResult.error,
      })
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
    }

    if (!customerResult.data) {
      return NextResponse.json({ orders: [], customer: null })
    }

    return NextResponse.json({
      customer: {
        totalOrders: toNumber(customerResult.data.total_orders),
        totalSpend: toNumber(customerResult.data.total_spend),
      },
      orders: (ordersResult.data ?? []).map(order => ({
        id: order.id,
        channel: order.channel,
        externalOrderId: order.external_order_id,
        orderReference: order.order_reference,
        status: order.status,
        itemsSummary: order.items_summary,
        totalAmount: toNumber(order.total_amount),
        currency: order.currency,
        orderPlacedAt: order.order_placed_at,
        trackingNumber: order.tracking_number,
      })),
    })
  } catch (err) {
    console.error('Conversation orders route error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
