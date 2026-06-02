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
import { sendWhatsAppMessage } from '@/lib/sendWhatsAppMessage'

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel env vars')
  }
  // Use service role key server-side so we bypass RLS when inserting webhook data.
  return createClient(supabaseUrl, supabaseKey)
}

interface WhatsAppContact {
  wa_id?: string
  profile?: {
    name?: string
  }
}

interface WhatsAppMessage {
  from?: string
  id?: string
  timestamp?: string
  type?: string
  text?: {
    body?: string
  }
}

interface WhatsAppWebhookValue {
  metadata?: {
    phone_number_id?: string
  }
  contacts?: WhatsAppContact[]
  messages?: WhatsAppMessage[]
  statuses?: unknown[]
}

interface WhatsAppChange {
  value?: WhatsAppWebhookValue
}

interface WhatsAppEntry {
  changes?: WhatsAppChange[]
}

interface WhatsAppWebhookPayload {
  entry?: WhatsAppEntry[]
}

interface StorePlatformRow {
  store_id: string
  organization_id: string
}

interface ConversationRow {
  id: string
  customer_id: string | null
}

interface CustomerRow {
  id: string
}

interface MessageInsertRow {
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

function findSenderName(contacts: WhatsAppContact[] | undefined, waId: string) {
  const contact = contacts?.find(item => item.wa_id === waId)
  return contact?.profile?.name?.trim() || 'WhatsApp Customer'
}

function toMessageTimestamp(timestamp: string | undefined) {
  const seconds = Number(timestamp)
  return Number.isFinite(seconds)
    ? new Date(seconds * 1000).toISOString()
    : new Date().toISOString()
}

async function linkWhatsAppCustomer(params: {
  supabase: ReturnType<typeof getSupabase>
  organizationId: string
  conversationId: string
  customerId: string | null
  whatsappId: string
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
        whatsapp_id: params.whatsappId,
      },
      { onConflict: 'organization_id,whatsapp_id', ignoreDuplicates: false }
    )
    .select('id')
    .single<CustomerRow>()

  if (customerErr || !customer) {
    console.error('Failed to upsert WhatsApp customer:', customerErr)
    return
  }

  const { error: linkErr } = await params.supabase
    .from('conversations')
    .update({ customer_id: customer.id })
    .eq('id', params.conversationId)
    .eq('organization_id', params.organizationId)

  if (linkErr) {
    console.error('Failed to link WhatsApp customer:', linkErr)
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
      channel: 'whatsapp',
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
      const sendResult = await sendWhatsAppMessage(params.supabase, {
        conversationId: params.conversationId,
        organizationId: params.organizationId,
        text: result.text,
      })

      if (sendResult.ok) {
        didAutoSend = true
      } else {
        console.error('WhatsApp auto-send failed:', sendResult.error)
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
    console.error('WhatsApp AI suggestion pipeline error:', err)

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

async function resolveStoreByPhoneNumberId(
  supabase: ReturnType<typeof getSupabase>,
  phoneNumberId: string
) {
  const { data: platform, error } = await supabase
    .from('store_platforms')
    .select('store_id, organization_id')
    .eq('platform_id', 'whatsapp')
    .eq('wa_phone_number_id', phoneNumberId)
    .single<StorePlatformRow>()

  if (error || !platform) {
    return null
  }

  return platform
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const verifyToken = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (
    mode === 'subscribe' &&
    verifyToken === process.env.WHATSAPP_VERIFY_TOKEN &&
    challenge
  ) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  return new NextResponse('Forbidden', { status: 403 })
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase()
    const payload = await req.json() as WhatsAppWebhookPayload
    const changes = payload.entry?.flatMap(entry => entry.changes ?? []) ?? []

    for (const change of changes) {
      const value = change.value
      const textMessages = (value?.messages ?? []).filter(message => message.type === 'text')

      if (textMessages.length === 0) {
        continue
      }

      const phoneNumberId = value?.metadata?.phone_number_id
      if (!phoneNumberId) {
        console.error('WhatsApp webhook text message missing phone_number_id')
        return NextResponse.json({ ok: false }, { status: 400 })
      }

      const storeRow = await resolveStoreByPhoneNumberId(supabase, phoneNumberId)
      if (!storeRow) {
        console.error('WhatsApp webhook received for an unknown phone_number_id')
        return NextResponse.json({ ok: false }, { status: 400 })
      }

      for (const message of textMessages) {
        const waId = message.from?.trim()
        const messageId = message.id?.trim()
        const text = message.text?.body ?? ''

        if (!waId || !messageId || !text.trim()) {
          continue
        }

        const senderName = findSenderName(value?.contacts, waId)
        const timestamp = toMessageTimestamp(message.timestamp)
        const ORG_ID = storeRow.organization_id

        const { data: conv, error: convErr } = await supabase
          .from('conversations')
          .upsert(
            {
              organization_id: ORG_ID,
              store_id: storeRow.store_id,
              channel: 'whatsapp',
              external_id: waId,
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
          console.error('Failed to upsert WhatsApp conversation:', convErr)
          return NextResponse.json({ ok: false }, { status: 500 })
        }

        await linkWhatsAppCustomer({
          supabase,
          organizationId: ORG_ID,
          conversationId: conv.id,
          customerId: conv.customer_id,
          whatsappId: waId,
          senderName,
        })

        await supabase
          .from('conversations')
          .update({ last_message: text, last_message_at: timestamp, is_read: false, status: 'open' })
          .eq('id', conv.id)
          .eq('organization_id', ORG_ID)

        const { data: insertedMessage, error: msgErr } = await supabase
          .from('messages')
          .upsert(
            {
              conversation_id: conv.id,
              organization_id: ORG_ID,
              external_id: messageId,
              sender: 'customer',
              content: text,
              timestamp,
            },
            { onConflict: 'conversation_id,external_id', ignoreDuplicates: true }
          )
          .select('id')
          .maybeSingle<MessageInsertRow>()

        if (msgErr) {
          console.error('Failed to insert WhatsApp message:', msgErr)
          continue
        }

        if (insertedMessage) {
          await triggerAiSuggestion({
            supabase,
            organizationId: ORG_ID,
            conversationId: conv.id,
            storeId: storeRow.store_id,
            latestMessage: text,
            senderName,
          })
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('WhatsApp webhook error:', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
