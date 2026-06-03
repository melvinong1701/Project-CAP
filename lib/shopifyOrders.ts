import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

interface ShopifyOrderAddress {
  country_code?: string
}

interface ShopifyOrderCustomer {
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  default_address?: ShopifyOrderAddress
}

export type CustomerOrderStatus = 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'returned'

export interface ShopifyLineItem {
  title?: string
  name?: string
  quantity?: number
}

export interface ShopifyFulfillment {
  status?: string | null
  shipment_status?: string | null
  tracking_number?: string | null
  tracking_numbers?: string[] | null
}

export interface ShopifyOrder {
  id: number | string
  name?: string
  order_number?: number
  customer?: ShopifyOrderCustomer
  billing_address?: ShopifyOrderAddress
  total_price: string
  currency: string
  created_at: string
  cancelled_at?: string | null
  financial_status?: string | null
  fulfillment_status?: string | null
  line_items?: ShopifyLineItem[]
  fulfillments?: ShopifyFulfillment[]
  refunds?: unknown[]
}

export function shopifyOrderToCustomerOrderRow(params: {
  organizationId: string
  storeId: string
  customerId: string
  order: ShopifyOrder
}) {
  const { organizationId, storeId, customerId, order } = params

  return {
    organization_id: organizationId,
    customer_id: customerId,
    store_id: storeId,
    channel: 'shopify',
    external_order_id: String(order.id),
    order_reference: order.name ?? (order.order_number != null ? `#${order.order_number}` : null),
    status: mapShopifyOrderStatus(order),
    items_summary: summarizeOrderItems(order.line_items),
    total_amount: toOrderTotal(order.total_price),
    currency: order.currency || 'SGD',
    order_placed_at: order.created_at || null,
    tracking_number: getTrackingNumber(order),
    raw_payload: order,
  }
}

export async function upsertShopifyCustomerOrder(
  supabase: SupabaseClient,
  params: {
    organizationId: string
    storeId: string
    customerId: string
    order: ShopifyOrder
  }
): Promise<PostgrestError | null> {
  const { error } = await supabase
    .from('customer_orders')
    .upsert(shopifyOrderToCustomerOrderRow(params), {
      onConflict: 'organization_id,channel,external_order_id',
    })

  return error
}

export function mapShopifyOrderStatus(order: ShopifyOrder): CustomerOrderStatus {
  const financialStatus = normalizeOrderState(order.financial_status)
  const fulfillmentStatus = normalizeOrderState(order.fulfillment_status)
  const fulfillmentStates = (order.fulfillments ?? []).flatMap(fulfillment => [
    normalizeOrderState(fulfillment.status),
    normalizeOrderState(fulfillment.shipment_status),
  ])
  const hasRefund = (order.refunds?.length ?? 0) > 0

  if (order.cancelled_at) return 'cancelled'

  if (
    financialStatus === 'refunded' ||
    financialStatus === 'partially_refunded' ||
    fulfillmentStatus === 'returned' ||
    fulfillmentStates.includes('returned') ||
    hasRefund
  ) {
    return 'returned'
  }

  if (fulfillmentStatus === 'delivered' || fulfillmentStates.includes('delivered')) {
    return 'delivered'
  }

  if (
    fulfillmentStatus === 'fulfilled' ||
    fulfillmentStatus === 'partial' ||
    fulfillmentStatus === 'shipped' ||
    fulfillmentStates.some(state => ['in_transit', 'out_for_delivery', 'success'].includes(state)) ||
    Boolean(getTrackingNumber(order))
  ) {
    return 'shipped'
  }

  return 'processing'
}

export function summarizeOrderItems(lineItems: ShopifyLineItem[] | undefined): string | null {
  if (!lineItems?.length) return null

  const visibleItems = lineItems.slice(0, 3).map(item => {
    const quantity = Math.max(Number(item.quantity) || 1, 1)
    return `${quantity}x ${item.title || item.name || 'Item'}`
  })
  const extraCount = lineItems.length - visibleItems.length

  return extraCount > 0
    ? `${visibleItems.join(', ')}, +${extraCount} more`
    : visibleItems.join(', ')
}

export function getTrackingNumber(order: ShopifyOrder): string | null {
  for (const fulfillment of order.fulfillments ?? []) {
    const singleTrackingNumber = fulfillment.tracking_number?.trim()
    if (singleTrackingNumber) return singleTrackingNumber

    const trackingNumber = fulfillment.tracking_numbers?.find(value => value.trim())
    if (trackingNumber) return trackingNumber.trim()
  }

  return null
}

export function toOrderTotal(value: string) {
  const total = Number(value)
  return Number.isFinite(total) ? total : 0
}

function normalizeOrderState(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, '_') ?? ''
}
