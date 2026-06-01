import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  preprocessMessage,
  suggestReply,
  type ConversationContextMessage,
  type PreprocessingResult,
  type RetrievedContextSnippet,
  type StoreConfig,
  type SuggestReplyInput,
} from '@/lib/aiRouter'
import {
  calibrateConfidence,
  canAutoSend,
  downgradeForAmbiguity,
  isConfidenceCalibrationShadowMode,
} from '@/lib/autoSend'
import { CATALOG_INTENTS, buildCatalogSearchQuery, fetchCatalogContext } from '@/lib/catalogRetrieval'
import { KNOWLEDGE_INTENTS, buildKnowledgeSearchQuery, fetchKnowledgeContext } from '@/lib/knowledgeRetrieval'
import { sendTelegramMessage } from '@/lib/sendTelegramMessage'

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel env vars')
  }
  // Use service role key server-side so we bypass RLS when inserting.
  return createClient(supabaseUrl, supabaseKey)
}

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

interface StoreOrgRow {
  organization_id: string
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

function extractCurrentBlock(messages: ConversationContextMessage[]): ConversationContextMessage[] {
  const block: ConversationContextMessage[] = []

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].sender !== 'customer') {
      break
    }

    block.unshift(messages[i])
  }

  return block
}

async function linkTelegramCustomer(params: {
  supabase: ReturnType<typeof getSupabase>
  organizationId: string
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
        organization_id: params.organizationId,
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
    .eq('organization_id', params.organizationId)

  if (linkErr) {
    console.error('Failed to link Telegram customer:', linkErr)
  }
}

async function triggerAiSuggestion(params: {
  supabase: ReturnType<typeof getSupabase>
  organizationId: string
  conversationId: string
  storeId: string | null
  latestMessage: string
  senderName: string
}) {
  try {
    const { error: clearErr } = await params.supabase
      .from('conversations')
      .update({ ai_suggestion: null })
      .eq('id', params.conversationId)
      .eq('organization_id', params.organizationId)

    if (clearErr) {
      console.error('Failed to clear stale AI suggestion:', clearErr)
    }

    let storeConfig: StoreConfig | null = null

    if (params.storeId) {
      const { data: config, error: configErr } = await params.supabase
        .from('store_ai_config')
        .select('store_name, tone, primary_language, custom_instructions, custom_guardrails, auto_send_enabled')
        .eq('store_id', params.storeId)
        .eq('organization_id', params.organizationId)
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
      .eq('organization_id', params.organizationId)
      .order('timestamp', { ascending: false })
      .limit(10)

    if (msgErr) {
      throw msgErr
    }

    const history = toContextMessages(messages as MessageRow[] | null).reverse()
    const currentBlock = extractCurrentBlock(history)
    const suggestInput: SuggestReplyInput = {
      organizationId: params.organizationId,
      channel: 'telegram',
      customerName: params.senderName,
      latestMessage: params.latestMessage,
      currentBlock: currentBlock.length > 0
        ? currentBlock.slice(-5).map(message => message.content)
        : undefined,
      conversationHistory: history,
      storeConfig,
    }

    const preprocessing: PreprocessingResult = await preprocessMessage(suggestInput)
    let catalogContext: RetrievedContextSnippet[] = []
    let knowledgeContext: RetrievedContextSnippet[] = []
    if (params.storeId && CATALOG_INTENTS.has(preprocessing.intent)) {
      const searchQuery = buildCatalogSearchQuery(preprocessing, params.latestMessage, history)
      catalogContext = await fetchCatalogContext(params.supabase, params.organizationId, params.storeId, searchQuery)
    }
    if (params.storeId && KNOWLEDGE_INTENTS.has(preprocessing.intent)) {
      const searchQuery = buildKnowledgeSearchQuery(preprocessing, params.latestMessage)
      knowledgeContext = await fetchKnowledgeContext(params.supabase, params.organizationId, params.storeId, searchQuery)
    }

    const retrievedContext = [...catalogContext, ...knowledgeContext]

    const result = await suggestReply({
      ...suggestInput,
      retrievedContext,
    }, preprocessing)
    const effectiveConfidence = downgradeForAmbiguity(result.confidence, catalogContext.length, preprocessing.intent)
    const calibration = calibrateConfidence({
      confidence: effectiveConfidence,
      intent: preprocessing.intent,
      shouldEscalate: preprocessing.shouldEscalate,
      sourceCited: result.sourceCited ?? null,
      catalogMatchCount: catalogContext.length,
      text: result.text,
    })
    const shadowMode = isConfidenceCalibrationShadowMode()
    const sendConfidence = shadowMode ? effectiveConfidence : calibration.confidence
    const wouldAutoSend = canAutoSend({
      autoSendEnabled: storeConfig?.auto_send_enabled,
      confidence: calibration.confidence,
      intent: preprocessing.intent,
    })
    let didAutoSend = false

    if (
      canAutoSend({
        autoSendEnabled: storeConfig?.auto_send_enabled,
        confidence: sendConfidence,
        intent: preprocessing.intent,
      })
    ) {
      const sendResult = await sendTelegramMessage(params.supabase, {
        conversationId: params.conversationId,
        organizationId: params.organizationId,
        text: result.text,
      })

      if (sendResult.ok) {
        didAutoSend = true
      } else {
        console.error('Telegram auto-send failed:', sendResult.error)
      }
    }

    console.info(JSON.stringify({
      event: 'confidence_calibration',
      conversationId: params.conversationId,
      intent: preprocessing.intent,
      modelConfidence: result.confidence,
      effectiveConfidence,
      promotedConfidence: calibration.confidence,
      wouldAutoSend,
      didAutoSend,
      sourceCited: result.sourceCited ?? null,
      catalogMatchCount: catalogContext.length,
      knowledgeMatchCount: knowledgeContext.length,
      blockedReason: calibration.blockedReason,
    }))

    const { error: updateErr } = await params.supabase
      .from('conversations')
      .update({
        ai_suggestion: {
          text: result.text,
          confidence: sendConfidence,
          autoSent: didAutoSend,
          dismissed: false,
          reasoning: result.reasoning ?? null,
          sourceCited: result.sourceCited ?? null,
        },
      })
      .eq('id', params.conversationId)
      .eq('organization_id', params.organizationId)

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
      .eq('organization_id', params.organizationId)

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

    if (!storeId) {
      console.error('Missing storeId in Telegram webhook')
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    const { data: storeRow, error: storeError } = await supabase
      .from('stores')
      .select('organization_id')
      .eq('id', storeId)
      .single<StoreOrgRow>()

    if (storeError || !storeRow?.organization_id) {
      console.error('Unknown storeId in Telegram webhook:', storeId, storeError)
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    const ORG_ID = storeRow.organization_id

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
          status: 'open',
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
      organizationId: ORG_ID,
      conversationId: conv.id,
      customerId: conv.customer_id,
      chatId,
      senderName,
    })

    // Update last_message + is_read on existing rows (upsert above handles insert, this covers update)
    await supabase
      .from('conversations')
      .update({ last_message: text, last_message_at: timestamp, is_read: false, status: 'open' })
      .eq('id', conv.id)
      .eq('organization_id', ORG_ID)

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
        organizationId: ORG_ID,
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
