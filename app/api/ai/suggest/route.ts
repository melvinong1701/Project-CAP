import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  buildPreprocessingResult,
  preprocessMessage,
  suggestReply,
  type ConversationContextMessage,
  type PreprocessingResult,
  type RetrievedContextSnippet,
  type SuggestReplyInput,
} from '@/lib/aiRouter'
import type { Channel } from '@/lib/types'

const ORG_ID = '00000000-0000-0000-0000-000000000001'

interface SuggestRequestBody {
  conversationId?: string
  latestMessage?: string
  retrievedContext?: RetrievedContextSnippet[]
  sellerToneRules?: string[]
}

interface ConversationRow {
  id: string
  channel: Channel
  sender_name: string | null
  last_message: string | null
  ai_intent: string | null
  ai_language: string | null
  ai_sentiment: string | null
  ai_urgency: string | null
}

interface MessageRow {
  sender: string
  content: string
  timestamp: string
}

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel env vars')
  }
  return createClient(supabaseUrl, supabaseKey)
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
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

function hasCachedClassification(conversation: ConversationRow | null): boolean {
  return Boolean(
    conversation?.ai_intent &&
    conversation.ai_language &&
    conversation.ai_sentiment &&
    conversation.ai_urgency
  )
}

function preprocessingFromConversation(conversation: ConversationRow): PreprocessingResult {
  return buildPreprocessingResult({
    language: conversation.ai_language,
    intent: conversation.ai_intent,
    sentiment: conversation.ai_sentiment,
    urgency: conversation.ai_urgency,
  })
}

async function persistPreprocessing(params: {
  supabase: ReturnType<typeof getSupabase>
  conversationId: string
  preprocessing: PreprocessingResult
}) {
  return params.supabase
    .from('conversations')
    .update({
      ai_intent: params.preprocessing.intent,
      ai_language: params.preprocessing.language,
      ai_sentiment: params.preprocessing.sentiment,
      ai_urgency: params.preprocessing.urgency,
    })
    .eq('id', params.conversationId)
    .eq('organization_id', ORG_ID)
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return jsonError('OPENAI_API_KEY is required for AI suggestions', 500)
    }

    const body = await req.json() as SuggestRequestBody
    if (!body.conversationId && !body.latestMessage?.trim()) {
      return jsonError('conversationId or latestMessage is required', 400)
    }

    const supabase = getSupabase()
    let conversation: ConversationRow | null = null
    let history: ConversationContextMessage[] = []

    if (body.conversationId) {
      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .select('id, channel, sender_name, last_message, ai_intent, ai_language, ai_sentiment, ai_urgency')
        .eq('id', body.conversationId)
        .eq('organization_id', ORG_ID)
        .single()

      if (convErr || !conv) {
        return jsonError('Conversation not found', 404)
      }

      conversation = conv as ConversationRow

      const { data: messages, error: msgErr } = await supabase
        .from('messages')
        .select('sender, content, timestamp')
        .eq('conversation_id', body.conversationId)
        .eq('organization_id', ORG_ID)
        .order('timestamp', { ascending: false })
        .limit(8)

      if (msgErr) {
        return jsonError('Failed to load conversation messages', 500)
      }

      history = toContextMessages(messages as MessageRow[] | null).reverse()
    }

    const latestMessage = body.latestMessage?.trim() || conversation?.last_message?.trim()
    if (!latestMessage) {
      return jsonError('latestMessage could not be resolved', 400)
    }

    const suggestInput: SuggestReplyInput = {
      organizationId: ORG_ID,
      channel: conversation?.channel ?? 'telegram',
      customerName: conversation?.sender_name ?? undefined,
      latestMessage,
      conversationHistory: history,
      retrievedContext: body.retrievedContext ?? [],
      sellerToneRules: body.sellerToneRules ?? [
        'Sound helpful, concise, and human.',
        'Do not overpromise.',
        'Escalate rather than invent facts when order or policy data is missing.',
      ],
    }

    let preprocessing: PreprocessingResult

    if (conversation && hasCachedClassification(conversation)) {
      preprocessing = preprocessingFromConversation(conversation)
    } else {
      preprocessing = await preprocessMessage(suggestInput)

      if (conversation) {
        const { error: persistErr } = await persistPreprocessing({
          supabase,
          conversationId: conversation.id,
          preprocessing,
        })

        if (persistErr) {
          return jsonError('Failed to persist AI classification', 500)
        }
      }
    }

    const result = await suggestReply(suggestInput, preprocessing)

    return NextResponse.json({
      data: result,
    })
  } catch (err) {
    console.error('AI suggest error:', err instanceof Error ? err.message : 'Unknown error')
    return jsonError('Internal error while generating AI suggestion', 500)
  }
}
