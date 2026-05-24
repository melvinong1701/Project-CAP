import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import {
  ShopifyWebhookProduct,
  deleteProduct,
  shopifyProductGid,
  shopifyWebhookProductToRow,
  upsertProduct,
} from '@/lib/shopifyProductSync'

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

interface ShopifyCustomer {
  first_name?: string
  last_name?: string
  email?: string
}

interface ShopifyLineItem {
  title: string
  quantity: number
}

interface ShopifyOrder {
  id: number
  order_number: number
  customer?: ShopifyCustomer
  line_items: ShopifyLineItem[]
  total_price: string
  currency: string
  created_at: string
}

interface ConversationRow {
  id: string
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

    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
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

    if (topic === 'orders/create') {
      const order = JSON.parse(rawBody.toString()) as ShopifyOrder
      await handleOrderCreate({ order, storeId, organizationId: platformRow.organization_id })
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

async function handleOrderCreate(params: { order: ShopifyOrder; storeId: string; organizationId: string }) {
  const { order, storeId, organizationId } = params
  const supabase = getSupabase()

  const customerName = [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' ')
    || order.customer?.email
    || 'Unknown customer'
  const itemCount = order.line_items.reduce((sum, item) => sum + item.quantity, 0)
  const summary = `New order #${order.order_number} — ${itemCount} item(s) — ${order.currency} ${order.total_price}`

  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .upsert(
      {
        organization_id: organizationId,
        store_id: storeId,
        channel: 'shopify',
        external_id: String(order.id),
        sender_name: customerName,
        last_message: summary,
        last_message_at: order.created_at,
        is_read: false,
        status: 'open',
      },
      { onConflict: 'store_id,channel,external_id', ignoreDuplicates: false }
    )
    .select('id')
    .single<ConversationRow>()

  if (convErr || !conv) {
    console.error('Failed to upsert Shopify conversation:', convErr)
    return
  }

  const { error: msgErr } = await supabase
    .from('messages')
    .upsert(
      {
        conversation_id: conv.id,
        organization_id: organizationId,
        external_id: String(order.id),
        sender: 'customer',
        content: summary,
        timestamp: order.created_at,
      },
      { onConflict: 'conversation_id,external_id', ignoreDuplicates: true }
    )

  if (msgErr) {
    console.error('Failed to insert Shopify message:', msgErr)
  }
}
