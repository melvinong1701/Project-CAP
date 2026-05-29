import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  type AiIntent,
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

const CATALOG_INTENTS = new Set<AiIntent>(['product_question', 'pricing', 'availability'])
const MAX_CATALOG_SEARCH_QUERY_LENGTH = 240
const MAX_CATALOG_CARRY_QUERY_LENGTH = 120
const GENERIC_CATALOG_TAGS = new Set([
  'about',
  'and',
  'are',
  'available',
  'availability',
  'beige',
  'black',
  'blue',
  'brown',
  'color',
  'colors',
  'colour',
  'colours',
  'cost',
  'could',
  'does',
  'for',
  'gray',
  'green',
  'grey',
  'gold',
  'have',
  'hello',
  'how',
  'item',
  'items',
  'large',
  'looking',
  'medium',
  'much',
  'navy',
  'need',
  'one',
  'ones',
  'option',
  'options',
  'orange',
  'pink',
  'please',
  'price',
  'pricing',
  'product',
  'products',
  'purple',
  'red',
  'same',
  'silver',
  'size',
  'sizes',
  'small',
  'stock',
  'thank',
  'thanks',
  'that',
  'the',
  'there',
  'these',
  'this',
  'those',
  'variant',
  'variants',
  'white',
  'with',
  'would',
  'want',
  'yellow',
  'you',
  'xs',
  'xl',
  'xxl',
])

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

interface ProductRow {
  title: string
  product_type: string | null
  tags: string[] | null
  status: string | null
  variants: { title: string; price: string; sku: string | null; availableForSale: boolean }[]
}

async function fetchCatalogContext(
  supabase: SupabaseClient,
  organizationId: string,
  storeId: string,
  query: string
): Promise<RetrievedContextSnippet[]> {
  const { data, error } = await supabase
    .rpc('search_store_products', {
      p_organization_id: organizationId,
      p_store_id: storeId,
      p_query: query,
      p_limit: 4,
    })

  if (error || !data) {
    console.error('Catalog search error:', error)
    return []
  }

  return (data as ProductRow[]).map((product) => {
    const variantSummary = product.variants
      .map((variant) =>
        variant.availableForSale
          ? `${variant.title} — ${variant.price}`
          : `${variant.title} — ${variant.price} (unavailable)`
      )
      .join(', ')

    const content = [
      product.product_type ? `Type: ${product.product_type}` : null,
      product.status ? `Status: ${product.status}` : null,
      product.tags?.length ? `Tags: ${product.tags.join(', ')}` : null,
      variantSummary ? `Variants: ${variantSummary}` : 'No variants listed',
    ]
      .filter(Boolean)
      .join('. ')

    return {
      title: product.title,
      content,
      source: 'product_catalog',
    }
  })
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

function compactSearchText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function truncateSearchText(value: string, maxLength: number): string {
  const compacted = compactSearchText(value)
  if (compacted.length <= maxLength) {
    return compacted
  }

  const truncated = compacted.slice(0, maxLength).replace(/\s+\S*$/, '').trim()
  return truncated || compacted.slice(0, maxLength).trim()
}

function normalizeCatalogToken(value: string): string {
  return value.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
}

function isSpecificCatalogToken(value: string): boolean {
  const token = normalizeCatalogToken(value)
  if (!token) {
    return false
  }

  if (/\d/.test(token)) {
    return true
  }

  return token.length >= 3 && !GENERIC_CATALOG_TAGS.has(token)
}

function hasSpecificCatalogTag(tags: string[]): boolean {
  return tags.some(tag => tag.split(/\s+/).some(isSpecificCatalogToken))
}

function findMostRecentPriorCustomerTurn(
  history: ConversationContextMessage[],
  latestMessage: string
): string | null {
  const normalizedLatest = compactSearchText(latestMessage).toLowerCase()

  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i]
    if (message.sender !== 'customer') {
      continue
    }

    const content = compactSearchText(message.content)
    if (!content || content.toLowerCase() === normalizedLatest) {
      continue
    }

    if (!content.split(/\s+/).some(isSpecificCatalogToken)) {
      continue
    }

    return truncateSearchText(content, MAX_CATALOG_CARRY_QUERY_LENGTH)
  }

  return null
}

function combineCatalogSearchTerms(currentQuery: string, carriedQuery: string | null): string {
  const current = truncateSearchText(currentQuery, MAX_CATALOG_SEARCH_QUERY_LENGTH)
  if (!carriedQuery) {
    return current
  }

  const remainingLength = MAX_CATALOG_SEARCH_QUERY_LENGTH - current.length - 1
  if (remainingLength <= 0) {
    return current
  }

  const carry = truncateSearchText(
    carriedQuery,
    Math.min(MAX_CATALOG_CARRY_QUERY_LENGTH, remainingLength)
  )

  return compactSearchText(`${current} ${carry}`)
}

function buildCatalogSearchQuery(
  preprocessing: PreprocessingResult,
  latestMessage: string,
  history: ConversationContextMessage[]
): string {
  const currentQuery = preprocessing.tags.length > 0
    ? preprocessing.tags.join(' ')
    : latestMessage

  // If the current turn only has generic terms like a colour, size, or "price",
  // carry the last customer product mention as secondary retrieval context.
  const carriedQuery = hasSpecificCatalogTag(preprocessing.tags)
    ? null
    : findMostRecentPriorCustomerTurn(history, latestMessage)

  return combineCatalogSearchTerms(currentQuery, carriedQuery)
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
      retrievedContext: [],
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
      storeConfig?.auto_send_enabled === true &&
      result.confidence === 'high'
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
