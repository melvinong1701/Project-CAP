import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  preprocessMessage,
  suggestReply,
  type ConversationContextMessage,
  type PreprocessingResult,
  type StoreConfig,
  type SuggestReplyInput,
} from '@/lib/aiRouter'

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel env vars')
  }
  // Use service role key server-side so we bypass RLS when inserting.
  return createClient(supabaseUrl, supabaseKey)
}

const ORG_ID = '00000000-0000-0000-0000-000000000001'

interface TelegramMessage {
  message_id: number
  from?: {
    id: number
    first_name?: string
    last_name?: string
    username?: string
  }
  chat: { id: number; type: string }
  date: number
  text?: string
  caption?: string
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
  channel_post?: TelegramMessage
}

interface ConversationRow {
  id: string
  customer_id: string | null
}

interface CustomerRow {
  id: string
}

interface MessageRow {
  sender: string
  content: string
  timestamp: string
}

function isKnownSender(sender: string): sender is ConversationContextMessage['sender'] {
  return sender === 'agent' || sender === 'ai' || sender === 'customer'
}

function toContextMessages(messages: MessageRow[] | null): ConversationContextMessage[] {
  if (!messages) {
    return []
  }

  return messages
    .filter((message) => isKnownSender(message.sender))
    .map((message) => ({
      sender: message.sender as ConversationContextMessage['sender'],
      content: message.content,
      timestamp: message.timestamp,
    }))
}

async function linkTelegramCustomer(params: {
  supabase: ReturnType<typeof getSupabase>
  conversationId: string
  customerId: string | null
  chatId: string
  senderName: string
}) {
  if (params.customerId) {
    return
  }

  const { data: customer, error: customerErr } = await params.supabase
    .from('customers')
    .upsert(
      {
        organization_id: ORG_ID,
        display_name: params.senderName,
        telegram_id: params.chatId,
      },
      { onConflict: 'organization_id,telegram_id', ignoreDuplicates: false }
    )
    .select('id')
    .single<CustomerRow>()

  if (customerErr || !customer) {
    console.error('Failed to upsert Telegram customer:', customerErr)
    return
  }

  const { error: linkErr } = await params.supabase
    .from('conversations')
    .update({ customer_id: customer.id })
    .eq('id', params.conversationId)
    .eq('organization_id', ORG_ID)

  if (linkErr) {
    console.error('Failed to link Telegram customer:', linkErr)
  }
}

async function triggerAiSuggestion(params: {
  supabase: ReturnType<typeof getSupabase>
  conversationId: string
  storeId: string | null
  latestMessage: string
  senderName: string
}) {
  try {
    let storeConfig: StoreConfig | null = null

    if (params.storeId) {
      const { data: config, error: configErr } = await params.supabase
        .from('store_ai_config')
        .select('store_name, tone, primary_language, return_policy, shipping_policy, custom_instructions, custom_guardrails')
        .eq('store_id', params.storeId)
        .eq('organization_id', ORG_ID)
        .maybeSingle()

      if (configErr) {
        throw configErr
      }

      storeConfig = config as StoreConfig | null
    }

    const { data: messages, error: msgErr } = await params.supabase
      .from('messages')
      .select('sender, content, timestamp')
      .eq('conversation_id', params.conversationId)
      .eq('organization_id', ORG_ID)
      .order('timestamp', { ascending: false })
      .limit(10)

    if (msgErr) {
      throw msgErr
    }

    const suggestInput: SuggestReplyInput = {
      organizationId: ORG_ID,
      channel: 'telegram',
      customerName: params.senderName,
      latestMessage: params.latestMessage,
      conversationHistory: toContextMessages(messages as MessageRow[] | null).reverse(),
      retrievedContext: [],
      storeConfig,
    }

    const preprocessing: PreprocessingResult = await preprocessMessage(suggestInput)
    const result = await suggestReply(suggestInput, preprocessing)

    const { error: updateErr } = await params.supabase
      .from('conversations')
      .update({
        ai_suggestion: {
          text: result.text,
          confidence: result.confidence,
          autoSent: false,
          dismissed: false,
        },
      })
      .eq('id', params.conversationId)
      .eq('organization_id', ORG_ID)

    if (updateErr) {
      console.error('Failed to write AI suggestion:', updateErr)
    }
  } catch (err) {
    console.error('Telegram AI suggestion pipeline error:', err)

    const { error: updateErr } = await params.supabase
      .from('conversations')
      .update({
        ai_suggestion: {
          error: 'pipeline_error',
          dismissed: false,
        },
      })
      .eq('id', params.conversationId)
      .eq('organization_id', ORG_ID)

    if (updateErr) {
      console.error('Failed to write AI pipeline error:', updateErr)
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase()
    const update: TelegramUpdate = await req.json()
    const msg = update.message ?? update.edited_message

    // Only handle text messages for now
    if (!msg || (!msg.text && !msg.caption)) {
      return NextResponse.json({ ok: true })
    }

    const chatId = String(msg.chat.id)
    const text = msg.text ?? msg.caption ?? ''
    const senderName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || msg.from?.username || 'Unknown'
    const timestamp = new Date(msg.date * 1000).toISOString()

    // storeId is embedded in the webhook URL (set during /api/telegram/connect registration).
    // e.g. /api/telegram/webhook?storeId=<uuid>
    const { searchParams } = new URL(req.url)
    const storeId: string | null = searchParams.get('storeId')

    // Upsert conversation (unique on store_id + channel + external_id)
    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .upsert(
        {
          organization_id: ORG_ID,
          store_id: storeId,
          channel: 'telegram',
          external_id: chatId,
          sender_name: senderName,
          last_message: text,
          last_message_at: timestamp,
          is_read: false,
        },
        { onConflict: 'store_id,channel,external_id', ignoreDuplicates: false }
      )
      .select('id, customer_id')
      .single<ConversationRow>()

    if (convErr || !conv) {
      console.error('Failed to upsert conversation:', convErr)
      return NextResponse.json({ ok: false }, { status: 500 })
    }

    await linkTelegramCustomer({
      supabase,
      conversationId: conv.id,
      customerId: conv.customer_id,
      chatId,
      senderName,
    })

    // Update last_message + is_read on existing rows (upsert above handles insert, this covers update)
    await supabase
      .from('conversations')
      .update({ last_message: text, last_message_at: timestamp, is_read: false })
      .eq('id', conv.id)

    // Insert message
    const { error: msgErr } = await supabase.from('messages').insert({
      conversation_id: conv.id,
      organization_id: ORG_ID,
      sender: 'customer',
      content: text,
      timestamp,
    })

    if (msgErr) {
      console.error('Failed to insert message:', msgErr)
    } else {
      await triggerAiSuggestion({
        supabase,
        conversationId: conv.id,
        storeId,
        latestMessage: text,
        senderName,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Webhook error:', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
