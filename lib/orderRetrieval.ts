import { type SupabaseClient } from '@supabase/supabase-js'
import {
  type AiIntent,
  type RetrievedContextSnippet,
  type RetrievedContextSource,
} from '@/lib/aiRouter'

export const ORDER_INTENTS = new Set<AiIntent>(['order_status', 'shipping'])

const ORDER_CONTEXT_LIMIT = 5
const ORDER_CONTEXT_SOURCE: RetrievedContextSource = 'order_history'

interface OrderRow {
  id: string
  external_order_id: string
  order_reference: string | null
  status: string
  items_summary: string | null
  total_amount: number | string | null
  currency: string | null
  tracking_number: string | null
}

function formatAmount(amount: number | string | null, currency: string | null): string | null {
  if (amount === null) {
    return null
  }

  const value = typeof amount === 'number'
    ? amount.toFixed(2)
    : amount.trim()

  if (!value) {
    return null
  }

  return currency?.trim()
    ? `${currency.trim()} ${value}`
    : value
}

export async function fetchOrderContext(
  supabase: SupabaseClient,
  organizationId: string,
  customerId: string | null | undefined,
  disclosableOrderIds: string[]
): Promise<RetrievedContextSnippet[]> {
  const uniqueDisclosableOrderIds = Array.from(new Set(disclosableOrderIds.filter(Boolean)))

  if (!customerId || uniqueDisclosableOrderIds.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from('customer_orders')
    .select('id, external_order_id, order_reference, status, items_summary, total_amount, currency, tracking_number')
    .eq('organization_id', organizationId)
    .eq('customer_id', customerId)
    .in('id', uniqueDisclosableOrderIds)
    .order('order_placed_at', { ascending: false, nullsFirst: false })
    .limit(ORDER_CONTEXT_LIMIT)
    .returns<OrderRow[]>()

  if (error || !data) {
    console.error('Order retrieval error:', error)
    return []
  }

  return data.map((order) => {
    const amount = formatAmount(order.total_amount, order.currency)
    const content = [
      `Status: ${order.status}`,
      order.items_summary ? `Items: ${order.items_summary}` : null,
      amount ? `Total: ${amount}` : null,
      order.tracking_number ? `Tracking: ${order.tracking_number}` : null,
    ]
      .filter(Boolean)
      .join('. ')

    return {
      title: order.order_reference ?? order.external_order_id,
      content,
      source: ORDER_CONTEXT_SOURCE,
    }
  })
}
