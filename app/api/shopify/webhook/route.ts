import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const ORG_ID = '00000000-0000-0000-0000-000000000001'

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

    if (topic === 'orders/create') {
      const order = JSON.parse(rawBody.toString()) as ShopifyOrder
      await handleOrderCreate({ order, storeId })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Shopify webhook error:', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

async function handleOrderCreate(params: { order: ShopifyOrder; storeId: string }) {
  const { order, storeId } = params
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
        organization_id: ORG_ID,
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
        organization_id: ORG_ID,
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
