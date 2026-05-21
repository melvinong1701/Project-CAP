import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveCustomerIdentity } from '@/lib/identity-resolution'
import { requireAuth } from '@/lib/getOrgId'

interface RouteContext {
  params: { id: string }
}

interface ConversationRow {
  id: string
  organization_id: string
  customer_id: string | null
  channel: string
  external_id: string
  sender_name: string
  store_id: string | null
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

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel env vars')
  }
  return createClient(supabaseUrl, supabaseKey)
}

function cleanText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function mapCustomer(row: CustomerRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    displayName: row.display_name ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    notes: row.notes ?? undefined,
    telegramId: row.telegram_id ?? undefined,
    shopeeBuyerId: row.shopee_buyer_id ?? undefined,
    lazadaBuyerId: row.lazada_buyer_id ?? undefined,
    tiktokBuyerId: row.tiktok_buyer_id ?? undefined,
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await requireAuth()
    if (ctx instanceof NextResponse) return ctx
    const ORG_ID = ctx.organizationId

    const conversationId = params.id
    const body = await req.json() as Record<string, unknown>
    const supabase = getSupabase()

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id, organization_id, customer_id, channel, external_id, sender_name, store_id')
      .eq('id', conversationId)
      .eq('organization_id', ORG_ID)
      .single<ConversationRow>()

    if (conversationError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const customerPayload = {
      organization_id: ORG_ID,
      display_name: cleanText(body.displayName),
      email: cleanText(body.email),
      phone: cleanText(body.phone),
      notes: cleanText(body.notes),
      telegram_id: conversation.channel === 'telegram' ? conversation.external_id : null,
      shopee_buyer_id: null,
      lazada_buyer_id: null,
      tiktok_buyer_id: null,
    }

    if (conversation.customer_id) {
      const { data: customer, error: updateError } = await supabase
        .from('customers')
        .update(customerPayload)
        .eq('id', conversation.customer_id)
        .eq('organization_id', ORG_ID)
        .select('id, organization_id, display_name, email, phone, notes, telegram_id, shopee_buyer_id, lazada_buyer_id, tiktok_buyer_id')
        .single<CustomerRow>()

      if (updateError || !customer) {
        console.error('Update customer error:', updateError)
        return NextResponse.json({ error: 'Failed to save contact' }, { status: 500 })
      }

      const resolvedCustomer = await resolveCustomerForResponse(supabase, ORG_ID, customer.id, conversation)

      return NextResponse.json({ customer: mapCustomer(resolvedCustomer) })
    }

    const { data: customer, error: insertError } = await supabase
      .from('customers')
      .insert(customerPayload)
      .select('id, organization_id, display_name, email, phone, notes, telegram_id, shopee_buyer_id, lazada_buyer_id, tiktok_buyer_id')
      .single<CustomerRow>()

    if (insertError || !customer) {
      console.error('Create customer error:', insertError)
      return NextResponse.json({ error: 'Failed to save contact' }, { status: 500 })
    }

    const { error: linkError } = await supabase
      .from('conversations')
      .update({ customer_id: customer.id })
      .eq('id', conversation.id)
      .eq('organization_id', ORG_ID)

    if (linkError) {
      console.error('Link customer error:', linkError)
      return NextResponse.json({ error: 'Failed to link contact' }, { status: 500 })
    }

    const resolvedCustomer = await resolveCustomerForResponse(supabase, ORG_ID, customer.id, conversation)

    return NextResponse.json({ customer: mapCustomer(resolvedCustomer) })
  } catch (err) {
    console.error('Customer PATCH error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

async function resolveCustomerForResponse(
  supabase: ReturnType<typeof getSupabase>,
  organizationId: string,
  customerId: string,
  conversation: ConversationRow
): Promise<CustomerRow> {
  const resolution = await resolveCustomerIdentity({
    supabase,
    organizationId,
    customerId,
    conversationId: conversation.id,
    storeId: conversation.store_id,
    lastContactAt: new Date(),
  })

  const resolvedCustomerId = resolution.customerId
  const { data: customer, error } = await supabase
    .from('customers')
    .select('id, organization_id, display_name, email, phone, notes, telegram_id, shopee_buyer_id, lazada_buyer_id, tiktok_buyer_id')
    .eq('id', resolvedCustomerId)
    .eq('organization_id', organizationId)
    .single<CustomerRow>()

  if (error || !customer) {
    throw new Error('Resolved customer not found')
  }

  return customer
}
