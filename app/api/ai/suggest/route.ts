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
import type { Channel } from '@/lib/types'
import { requireAuth } from '@/lib/getOrgId'
import { sendTelegramMessage } from '@/lib/sendTelegramMessage'
import { canAutoSend } from '@/lib/autoSend'
import { CATALOG_INTENTS, buildCatalogSearchQuery, fetchCatalogContext } from '@/lib/catalogRetrieval'

export const dynamic = 'force-dynamic'

interface SuggestRequestBody {
  conversationId?: string
  latestMessage?: string
  retrievedContext?: RetrievedContextSnippet[]
}

interface ConversationRow {
  id: string
  store_id: string | null
  channel: Channel
  sender_name: string | null
  last_message: string | null
}

interface MessageRow {
  sender: string
  content: string
  timestamp: string
}

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel env vars')
  }
  return createClient(supabaseUrl, supabaseKey)
}

type AiSuggestErrorCode = 'pipeline_error' | 'timeout' | 'no_messages'

function jsonAiError(error: AiSuggestErrorCode) {
  return NextResponse.json({ error }, { status: 200 })
}

function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false
  }

  const name = err.name.toLowerCase()
  const message = err.message.toLowerCase()
  const code = 'code' in err ? String((err as { code?: unknown }).code).toLowerCase() : ''

  return name.includes('timeout') || message.includes('timeout') || message.includes('timed out') || code.includes('timeout')
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

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    if (ctx instanceof NextResponse) return ctx
    const ORG_ID = ctx.organizationId

    const body = await req.json() as SuggestRequestBody
    if (!body.conversationId && !body.latestMessage?.trim()) {
      return jsonAiError('no_messages')
    }

    const supabase = getSupabase()
    let conversation: ConversationRow | null = null
    let storeConfig: StoreConfig | null = null
    let history: ConversationContextMessage[] = []

    if (body.conversationId) {
      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .select('id, store_id, channel, sender_name, last_message')
        .eq('id', body.conversationId)
        .eq('organization_id', ORG_ID)
        .single()

      if (convErr || !conv) {
        return jsonAiError('pipeline_error')
      }

      conversation = conv as ConversationRow

      const { data: messages, error: msgErr } = await supabase
        .from('messages')
        .select('sender, content, timestamp')
        .eq('conversation_id', body.conversationId)
        .eq('organization_id', ORG_ID)
        .order('timestamp', { ascending: false })
        .limit(10)

      if (msgErr) {
        return jsonAiError('pipeline_error')
      }

      history = toContextMessages(messages as MessageRow[] | null).reverse()

      if (history.length === 0 && !body.latestMessage?.trim()) {
        return jsonAiError('no_messages')
      }

      if (conversation.store_id) {
        const { data: config, error: configErr } = await supabase
          .from('store_ai_config')
          .select('store_name, tone, primary_language, return_policy, shipping_policy, custom_instructions, custom_guardrails, auto_send_enabled')
          .eq('store_id', conversation.store_id)
          .eq('organization_id', ORG_ID)
          .maybeSingle()

        if (configErr) {
          return jsonAiError('pipeline_error')
        }

        storeConfig = config as StoreConfig | null
      }
    }

    const latestMessage = body.latestMessage?.trim() || conversation?.last_message?.trim()
    if (!latestMessage) {
      return jsonAiError('no_messages')
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return jsonAiError('pipeline_error')
    }

    const currentBlock = extractCurrentBlock(history)
    const preprocessing: PreprocessingResult = await preprocessMessage({
      organizationId: ORG_ID,
      channel: conversation?.channel ?? 'telegram',
      customerName: conversation?.sender_name ?? undefined,
      latestMessage,
      currentBlock: currentBlock.length > 0
        ? currentBlock.slice(-5).map(message => message.content)
        : undefined,
      conversationHistory: history,
      storeConfig,
    })

    let catalogContext: RetrievedContextSnippet[] = body.retrievedContext ?? []
    if (
      catalogContext.length === 0 &&
      conversation?.store_id &&
      CATALOG_INTENTS.has(preprocessing.intent)
    ) {
      const searchQuery = buildCatalogSearchQuery(preprocessing, latestMessage, history)
      catalogContext = await fetchCatalogContext(supabase, ORG_ID, conversation.store_id, searchQuery)
    }

    const suggestInput: SuggestReplyInput = {
      organizationId: ORG_ID,
      channel: conversation?.channel ?? 'telegram',
      customerName: conversation?.sender_name ?? undefined,
      latestMessage,
      currentBlock: currentBlock.length > 0
        ? currentBlock.slice(-5).map(message => message.content)
        : undefined,
      conversationHistory: history,
      retrievedContext: catalogContext,
      storeConfig,
    }

    const result = await suggestReply(suggestInput, preprocessing)
    let didAutoSend = false

    if (
      body.conversationId &&
      canAutoSend({
        autoSendEnabled: storeConfig?.auto_send_enabled,
        confidence: result.confidence,
        intent: preprocessing.intent,
      })
    ) {
      const sendResult = await sendTelegramMessage(supabase, {
        conversationId: body.conversationId,
        organizationId: ORG_ID,
        text: result.text,
      })

      if (sendResult.ok) {
        didAutoSend = true
      } else {
        console.error('Auto-send failed:', sendResult.error)
      }
    }

    if (body.conversationId) {
      const { error: updateErr } = await supabase
        .from('conversations')
        .update({
          ai_suggestion: {
            text: result.text,
            confidence: result.confidence,
            autoSent: didAutoSend,
            dismissed: false,
            reasoning: result.reasoning ?? null,
            sourceCited: result.sourceCited ?? null,
          },
        })
        .eq('id', body.conversationId)
        .eq('organization_id', ORG_ID)

      if (updateErr) {
        return jsonAiError('pipeline_error')
      }
    }

    return NextResponse.json({
      data: { ...result, autoSent: didAutoSend },
    })
  } catch (err) {
    console.error('AI suggest error:', err instanceof Error ? err.message : 'Unknown error')
    return jsonAiError(isTimeoutError(err) ? 'timeout' : 'pipeline_error')
  }
}
