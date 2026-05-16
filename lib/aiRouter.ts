import type { AiConfidence, Channel } from '@/lib/types'

export const AI_MODEL_ROUTER = {
  preprocessing: 'gpt-5.4-nano',
  replyDefault: 'gpt-5.4-mini',
  replyEscalation: 'gpt-5.4',
} as const

export type AiIntent =
  | 'order_status'
  | 'shipping'
  | 'product_question'
  | 'returns'
  | 'refund'
  | 'dispute'
  | 'pricing'
  | 'availability'
  | 'other'

export type AiSentiment = 'positive' | 'neutral' | 'negative'
export type AiUrgency = 'low' | 'medium' | 'high'

export interface ConversationContextMessage {
  sender: 'agent' | 'ai' | 'customer'
  content: string
  timestamp?: string
}

export interface RetrievedContextSnippet {
  title: string
  content: string
  source?: string
}

export interface SuggestReplyInput {
  organizationId: string
  channel: Channel
  latestMessage: string
  customerName?: string
  conversationHistory?: ConversationContextMessage[]
  retrievedContext?: RetrievedContextSnippet[]
  sellerToneRules?: string[]
}

export interface PreprocessingResult {
  language: string
  intent: AiIntent
  sentiment: AiSentiment
  urgency: AiUrgency
  tags: string[]
  shouldEscalate: boolean
  escalationReason: string | null
}

export interface ReplyResult {
  text: string
  confidence: AiConfidence
  autoSent: boolean
  model: typeof AI_MODEL_ROUTER.replyDefault | typeof AI_MODEL_ROUTER.replyEscalation
}

export interface SuggestReplyResult {
  preprocessing: PreprocessingResult
  suggestion: ReplyResult
  routing: {
    preprocessingModel: typeof AI_MODEL_ROUTER.preprocessing
    replyModel: typeof AI_MODEL_ROUTER.replyDefault | typeof AI_MODEL_ROUTER.replyEscalation
    escalated: boolean
    escalationReason: string | null
  }
}

export interface CachedPreprocessingInput {
  language: unknown
  intent: unknown
  sentiment: unknown
  urgency: unknown
  tags?: unknown
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null
    }
  }>
  error?: {
    message?: string
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function asIntent(value: unknown): AiIntent {
  const intents: AiIntent[] = [
    'order_status',
    'shipping',
    'product_question',
    'returns',
    'refund',
    'dispute',
    'pricing',
    'availability',
    'other',
  ]

  return typeof value === 'string' && intents.includes(value as AiIntent) ? value as AiIntent : 'other'
}

function asSentiment(value: unknown): AiSentiment {
  return value === 'positive' || value === 'negative' || value === 'neutral' ? value : 'neutral'
}

function asUrgency(value: unknown): AiUrgency {
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'medium'
}

function asConfidence(value: unknown): AiConfidence {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'low'
}

function shouldEscalateFromPreprocessing(result: Pick<PreprocessingResult, 'intent' | 'sentiment' | 'urgency'>): boolean {
  return (
    (result.sentiment === 'negative' && result.urgency === 'high') ||
    result.intent === 'refund' ||
    result.intent === 'dispute'
  )
}

function escalationReasonFromPreprocessing(result: Pick<PreprocessingResult, 'intent' | 'sentiment' | 'urgency'>): string | null {
  if (result.intent === 'refund' || result.intent === 'dispute') {
    return `intent=${result.intent}`
  }

  if (result.sentiment === 'negative' && result.urgency === 'high') {
    return 'negative sentiment with high urgency'
  }

  return null
}

function parseJsonObject(content: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(content)

  if (!isRecord(parsed)) {
    throw new Error('Model returned non-object JSON')
  }

  return parsed
}

async function callOpenAiJson(params: {
  apiKey: string
  model: string
  system: string
  user: Record<string, unknown>
  maxCompletionTokens: number
}): Promise<Record<string, unknown>> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: params.model,
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: JSON.stringify(params.user) },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: params.maxCompletionTokens,
    }),
  })

  const payload = await response.json() as ChatCompletionResponse

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `OpenAI request failed with ${response.status}`)
  }

  const content = payload.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('OpenAI returned an empty response')
  }

  return parseJsonObject(content)
}

export function buildPreprocessingResult(input: CachedPreprocessingInput): PreprocessingResult {
  const base = {
    language: asString(input.language, 'unknown'),
    intent: asIntent(input.intent),
    sentiment: asSentiment(input.sentiment),
    urgency: asUrgency(input.urgency),
    tags: asStringArray(input.tags).slice(0, 5),
  }
  const shouldEscalate = shouldEscalateFromPreprocessing(base)

  return {
    ...base,
    shouldEscalate,
    escalationReason: shouldEscalate ? escalationReasonFromPreprocessing(base) : null,
  }
}

export async function preprocessMessage(input: SuggestReplyInput, apiKey: string): Promise<PreprocessingResult> {
  const system = [
    'You are the Queue 1 preprocessing router for Project Cap.',
    'Return JSON only.',
    'Classify this inbound marketplace support message before reply generation.',
    'Nano is used here for cheap, fast, structured preprocessing on 100% of inbound messages.',
    'Use only these intents: order_status, shipping, product_question, returns, refund, dispute, pricing, availability, other.',
    'Use sentiment: positive, neutral, negative.',
    'Use urgency: low, medium, high.',
    'Set shouldEscalate true only when sentiment is negative and urgency is high, or intent is refund/dispute.',
  ].join(' ')

  const raw = await callOpenAiJson({
    apiKey,
    model: AI_MODEL_ROUTER.preprocessing,
    system,
    user: {
      latestMessage: input.latestMessage,
      channel: input.channel,
      customerName: input.customerName,
      recentHistory: input.conversationHistory?.slice(-4) ?? [],
    },
    maxCompletionTokens: 300,
  })

  return buildPreprocessingResult({
    language: asString(raw.language, 'unknown'),
    intent: asIntent(raw.intent),
    sentiment: asSentiment(raw.sentiment),
    urgency: asUrgency(raw.urgency),
    tags: asStringArray(raw.tags).slice(0, 5),
  })
}

async function runReplyGeneration(params: {
  input: SuggestReplyInput
  preprocessing: PreprocessingResult
  apiKey: string
  model: typeof AI_MODEL_ROUTER.replyDefault | typeof AI_MODEL_ROUTER.replyEscalation
  escalationReason: string | null
}): Promise<ReplyResult> {
  const isEscalation = params.model === AI_MODEL_ROUTER.replyEscalation
  const system = [
    'You are the Queue 2 reply generator for Project Cap, an AI-native inbox for SEA marketplace sellers.',
    'Return JSON only with keys: text, confidence, autoSent.',
    'Use English, Bahasa Malaysia, or Bahasa Indonesia to match the customer language.',
    'Ground the answer only in the provided conversation and retrieved store context.',
    'Do not invent order status, refund promises, delivery dates, discounts, or policy details.',
    'Keep the customer-facing reply concise, normally 1-3 sentences.',
    'confidence must be high, medium, or low.',
    'autoSent may be true only when confidence is high and the answer is factual/routine.',
    isEscalation
      ? 'This is an escalation-tier generation using gpt-5.4 for higher-risk support cases.'
      : 'This is a default generation using gpt-5.4-mini for normal support replies.',
  ].join(' ')

  const raw = await callOpenAiJson({
    apiKey: params.apiKey,
    model: params.model,
    system,
    user: {
      latestMessage: params.input.latestMessage,
      channel: params.input.channel,
      customerName: params.input.customerName,
      preprocessing: params.preprocessing,
      escalationReason: params.escalationReason,
      recentHistory: params.input.conversationHistory?.slice(-6) ?? [],
      retrievedContext: params.input.retrievedContext?.slice(0, 5) ?? [],
      sellerToneRules: params.input.sellerToneRules?.slice(0, 8) ?? [],
    },
    maxCompletionTokens: 600,
  })

  const confidence = asConfidence(raw.confidence)

  return {
    text: asString(raw.text, ''),
    confidence,
    autoSent: raw.autoSent === true && confidence === 'high',
    model: params.model,
  }
}

export async function suggestReply(
  input: SuggestReplyInput,
  apiKey: string,
  preprocessingOverride?: PreprocessingResult
): Promise<SuggestReplyResult> {
  const preprocessing = preprocessingOverride ?? await preprocessMessage(input, apiKey)
  const initialReplyModel = preprocessing.shouldEscalate
    ? AI_MODEL_ROUTER.replyEscalation
    : AI_MODEL_ROUTER.replyDefault

  const initialSuggestion = await runReplyGeneration({
    input,
    preprocessing,
    apiKey,
    model: initialReplyModel,
    escalationReason: preprocessing.escalationReason,
  })

  if (initialReplyModel === AI_MODEL_ROUTER.replyDefault && initialSuggestion.confidence === 'low') {
    const escalationReason = 'mini reply confidence=low'
    const escalatedSuggestion = await runReplyGeneration({
      input,
      preprocessing,
      apiKey,
      model: AI_MODEL_ROUTER.replyEscalation,
      escalationReason,
    })

    return {
      preprocessing,
      suggestion: escalatedSuggestion,
      routing: {
        preprocessingModel: AI_MODEL_ROUTER.preprocessing,
        replyModel: AI_MODEL_ROUTER.replyEscalation,
        escalated: true,
        escalationReason,
      },
    }
  }

  return {
    preprocessing,
    suggestion: initialSuggestion,
    routing: {
      preprocessingModel: AI_MODEL_ROUTER.preprocessing,
      replyModel: initialReplyModel,
      escalated: initialReplyModel === AI_MODEL_ROUTER.replyEscalation,
      escalationReason: preprocessing.escalationReason,
    },
  }
}
