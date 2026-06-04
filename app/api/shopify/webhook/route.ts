import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import {
  ShopifyWebhookProduct,
  deleteProduct,
  shopifyProductGid,
  shopifyWebhookProductToRow,
  upsertProduct,
} from '@/lib/shopifyProductSync'
import { toOrderTotal, upsertShopifyCustomerOrder, type ShopifyOrder } from '@/lib/shopifyOrders'
import { resolveCustomerIdentity } from '@/lib/identity-resolution'
import { normalizePhone } from '@/lib/phone'

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured')
  }
  return createClient(supabaseUrl, supabaseKey)
}

function verifyWebhookHmac(rawBody: Buffer, hmacHeader: string, secret: string): boolean {
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64')

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader))
  } catch {
    return false
  }
}

interface CustomerRow {
  id: string
  display_name: string | null
  phone: string | null
  last_contact_at: string | null
}

interface RecordedShopifyOrderRow {
  id: string
  customer_id: string
}

interface RecordedShopifyOrderLookup {
  order: RecordedShopifyOrderRow | null
  shouldApplyOrderDelta: boolean
}

interface StorePlatformOrgRow {
  organization_id: string
}

interface ShopifyProductDeleteWebhook {
  id: number | string
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = Buffer.from(await req.arrayBuffer())
    const hmacHeader = req.headers.get('x-shopify-hmac-sha256') ?? ''
    const topic = req.headers.get('x-shopify-topic') ?? ''

    const clientSecret = process.env.SHOPIFY_WEBHOOK_SECRET ?? process.env.SHOPIFY_CLIENT_SECRET
    if (!clientSecret) {
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
    }

    if (!verifyWebhookHmac(rawBody, hmacHeader, clientSecret)) {
      return NextResponse.json({ error: 'HMAC verification failed' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')

    if (!storeId) {
      return NextResponse.json({ error: 'storeId missing' }, { status: 400 })
    }

    const supabase = getSupabase()
    const { data: platformRow, error: platformError } = await supabase
      .from('store_platforms')
      .select('organization_id')
      .eq('store_id', storeId)
      .eq('platform_id', 'shopify')
      .maybeSingle<StorePlatformOrgRow>()

    if (platformError) {
      console.error('Failed to resolve Shopify webhook org:', platformError)
      return NextResponse.json({ ok: false }, { status: 500 })
    }

    if (!platformRow?.organization_id) {
      console.error('Unknown storeId in Shopify webhook:', storeId)
      return NextResponse.json({ ok: true })
    }

    if (topic === 'orders/create' || topic === 'orders/updated') {
      const order = JSON.parse(rawBody.toString()) as ShopifyOrder
      await handleOrderUpsert({ order, storeId, organizationId: platformRow.organization_id })
    }

    if (topic === 'products/create' || topic === 'products/update') {
      const product = JSON.parse(rawBody.toString()) as ShopifyWebhookProduct
      await handleProductUpsert({
        product,
        storeId,
        organizationId: platformRow.organization_id,
        supabase,
      })
    }

    if (topic === 'products/delete') {
      const product = JSON.parse(rawBody.toString()) as ShopifyProductDeleteWebhook
      await handleProductDelete({
        product,
        storeId,
        organizationId: platformRow.organization_id,
        supabase,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Shopify webhook error:', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

async function handleProductUpsert(params: {
  product: ShopifyWebhookProduct
  storeId: string
  organizationId: string
  supabase: ReturnType<typeof getSupabase>
}) {
  const row = shopifyWebhookProductToRow(params.product, params.organizationId, params.storeId)
  const error = await upsertProduct(params.supabase, row)

  if (error) {
    console.error('Failed to upsert Shopify product:', error)
    return
  }

  await updateProductSyncCount({
    supabase: params.supabase,
    organizationId: params.organizationId,
    storeId: params.storeId,
  })
}

async function handleProductDelete(params: {
  product: ShopifyProductDeleteWebhook
  storeId: string
  organizationId: string
  supabase: ReturnType<typeof getSupabase>
}) {
  const error = await deleteProduct(params.supabase, {
    organizationId: params.organizationId,
    storeId: params.storeId,
    externalProductId: shopifyProductGid(params.product.id),
  })

  if (error) {
    console.error('Failed to delete Shopify product:', error)
    return
  }

  await updateProductSyncCount({
    supabase: params.supabase,
    organizationId: params.organizationId,
    storeId: params.storeId,
  })
}

async function updateProductSyncCount(params: {
  supabase: ReturnType<typeof getSupabase>
  organizationId: string
  storeId: string
}) {
  const { count, error: countError } = await params.supabase
    .from('store_products')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', params.organizationId)
    .eq('store_id', params.storeId)
    .eq('platform_id', 'shopify')

  if (countError) {
    console.error('Failed to count Shopify products:', countError)
    return
  }

  const now = new Date().toISOString()
  const { data, error } = await params.supabase
    .from('store_product_sync_state')
    .update({
      product_count: count ?? 0,
      last_synced_at: now,
      updated_at: now,
    })
    .eq('organization_id', params.organizationId)
    .eq('store_id', params.storeId)
    .eq('platform_id', 'shopify')
    .select('store_id')
    .returns<{ store_id: string }[]>()

  if (error) {
    console.error('Failed to update Shopify product sync state:', error)
    return
  }

  if ((data ?? []).length > 0) {
    return
  }

  const { error: insertError } = await params.supabase
    .from('store_product_sync_state')
    .insert({
      organization_id: params.organizationId,
      store_id: params.storeId,
      platform_id: 'shopify',
      product_count: count ?? 0,
      last_synced_at: now,
      last_sync_status: 'never',
      updated_at: now,
    })

  if (insertError) {
    console.error('Failed to insert Shopify product sync state:', insertError)
  }
}

async function handleOrderUpsert(params: { order: ShopifyOrder; storeId: string; organizationId: string }) {
  const { order, storeId, organizationId } = params
  const supabase = getSupabase()
  const recordedOrderLookup = await findRecordedShopifyOrder({
    supabase,
    organizationId,
    externalOrderId: String(order.id),
  })

  const customerName =
    [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' ') ||
    order.customer?.email ||
    'Unknown customer'

  const email = order.customer?.email?.trim() || null
  const rawPhone = order.customer?.phone?.trim() || null
  const customerCountry =
    order.customer?.default_address?.country_code ??
    order.billing_address?.country_code ??
    undefined
  const phone = normalizePhone(rawPhone, customerCountry)

  const customerId = await upsertShopifyCustomer({
    supabase,
    organizationId,
    customerName,
    email,
    phone,
    lastContactAt: order.created_at,
  })

  let resolvedCustomerId = customerId
  try {
    const resolution = await resolveCustomerIdentity({
      supabase,
      organizationId,
      customerId,
      conversationId: null,
      storeId,
      lastContactAt: order.created_at,
      orderDelta: recordedOrderLookup.shouldApplyOrderDelta
        ? { count: 1, spend: toOrderTotal(order.total_price) }
        : undefined,
    })
    resolvedCustomerId = resolution.customerId
  } catch (err) {
    console.error('Shopify customer identity resolution failed:', err)
  }

  const orderError = await upsertShopifyCustomerOrder(supabase, {
    organizationId,
    storeId,
    customerId: recordedOrderLookup.order?.customer_id ?? resolvedCustomerId,
    order,
  })

  if (orderError) {
    console.error('Failed to upsert Shopify customer order:', orderError)
  }
}

async function findRecordedShopifyOrder(params: {
  supabase: SupabaseClient
  organizationId: string
  externalOrderId: string
}): Promise<RecordedShopifyOrderLookup> {
  const { data, error } = await params.supabase
    .from('customer_orders')
    .select('id, customer_id')
    .eq('organization_id', params.organizationId)
    .eq('channel', 'shopify')
    .eq('external_order_id', params.externalOrderId)
    .maybeSingle<RecordedShopifyOrderRow>()

  if (error) {
    console.error('Failed to check existing Shopify customer order:', error)
    return { order: null, shouldApplyOrderDelta: false }
  }

  return {
    order: data,
    shouldApplyOrderDelta: !data,
  }
}

async function upsertShopifyCustomer(params: {
  supabase: SupabaseClient
  organizationId: string
  customerName: string
  email: string | null
  phone: string | null
  lastContactAt: string
}): Promise<string> {
  const { supabase, organizationId, customerName, email, phone, lastContactAt } = params

  if (email) {
    const existing = await findShopifyCustomerByEmail(supabase, organizationId, email)
    if (existing) {
      return updateExistingShopifyCustomer({
        supabase,
        organizationId,
        customer: existing,
        customerName,
        phone,
        lastContactAt,
      })
    }
  }

  const insertPayload = {
    organization_id: organizationId,
    display_name: customerName,
    email,
    phone,
    last_contact_at: lastContactAt,
  }

  const { data, error } = await supabase
    .from('customers')
    .insert(insertPayload)
    .select('id')
    .single<{ id: string }>()

  if (!error && data) {
    return data.id
  }

  if (!isUniqueViolation(error)) {
    throw new Error('Failed to create Shopify customer profile')
  }

  const conflictedCustomer = email
    ? await findShopifyCustomerByEmail(supabase, organizationId, email)
    : phone
      ? await findShopifyCustomerByPhone(supabase, organizationId, phone)
      : null

  if (!conflictedCustomer && phone) {
    const phoneCustomer = await findShopifyCustomerByPhone(supabase, organizationId, phone)
    if (phoneCustomer) {
      return updateExistingShopifyCustomer({
        supabase,
        organizationId,
        customer: phoneCustomer,
        customerName,
        phone,
        lastContactAt,
      })
    }
  }

  if (!conflictedCustomer) {
    throw new Error('Failed to recover Shopify customer profile after unique conflict')
  }

  return updateExistingShopifyCustomer({
    supabase,
    organizationId,
    customer: conflictedCustomer,
    customerName,
    phone,
    lastContactAt,
  })
}

async function findShopifyCustomerByEmail(
  supabase: SupabaseClient,
  organizationId: string,
  email: string
): Promise<CustomerRow | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('id, display_name, phone, last_contact_at')
    .eq('organization_id', organizationId)
    .eq('email', email)
    .limit(1)
    .maybeSingle<CustomerRow>()

  if (error) {
    throw new Error('Failed to find Shopify customer by email')
  }

  return data
}

async function findShopifyCustomerByPhone(
  supabase: SupabaseClient,
  organizationId: string,
  phone: string
): Promise<CustomerRow | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('id, display_name, phone, last_contact_at')
    .eq('organization_id', organizationId)
    .eq('phone', phone)
    .limit(1)
    .maybeSingle<CustomerRow>()

  if (error) {
    throw new Error('Failed to find Shopify customer by phone')
  }

  return data
}

async function updateExistingShopifyCustomer(params: {
  supabase: SupabaseClient
  organizationId: string
  customer: CustomerRow
  customerName: string
  phone: string | null
  lastContactAt: string
}): Promise<string> {
  const { supabase, organizationId, customer, customerName, phone, lastContactAt } = params
  const patch: { display_name?: string; phone?: string; last_contact_at?: string } = {}

  if (!customer.display_name) {
    patch.display_name = customerName
  }

  if (!customer.phone && phone) {
    patch.phone = phone
  }

  if (isLaterTimestamp(lastContactAt, customer.last_contact_at)) {
    patch.last_contact_at = lastContactAt
  }

  if (Object.keys(patch).length === 0) {
    return customer.id
  }

  const { error } = await supabase
    .from('customers')
    .update(patch)
    .eq('id', customer.id)
    .eq('organization_id', organizationId)

  if (!error) {
    return customer.id
  }

  if (patch.phone && isUniqueViolation(error)) {
    delete patch.phone
    if (Object.keys(patch).length === 0) {
      return customer.id
    }

    const { error: retryError } = await supabase
      .from('customers')
      .update(patch)
      .eq('id', customer.id)
      .eq('organization_id', organizationId)

    if (!retryError) {
      return customer.id
    }
  }

  throw new Error('Failed to update Shopify customer profile')
}

function isLaterTimestamp(candidate: string, current: string | null): boolean {
  if (!current) return true
  return new Date(candidate).getTime() > new Date(current).getTime()
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505')
}
