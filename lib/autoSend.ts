import type { AiConfidence } from '@/lib/types'
import type { AiIntent } from '@/lib/aiRouter'
import { CATALOG_INTENTS } from '@/lib/catalogRetrieval'
import { ORDER_INTENTS } from '@/lib/orderRetrieval'

const BLOCKED_AUTO_SEND_INTENTS = new Set<AiIntent>([
  'availability',
  'pricing',
  'refund',
  'dispute',
  'returns',
])

export const CALIBRATION_PROMOTE_INTENTS = new Set<AiIntent>([
  'product_question',
  'shipping',
  'order_status',
])

const HEDGE_OR_PROMISE_PATTERNS: RegExp[] = [
  /\b(i(?:'|\u2019)?ll|i will|we(?:'|\u2019)?ll|we will)\s+(look into|check|investigate|follow up|update you|get back to)\b/i,
  /\blet me\s+(check|look|confirm|verify)\b/i,
  /\bplease\s+(hold|wait|bear with me)\b/i,
  /\bget back to you\b/i,
  /\blook into (this|it)\b/i,
  /\b(i(?:'|\u2019)?ve|i have|we(?:'|\u2019)?ve|we have)\s+(processed|updated|arranged|issued|approved)\b/i,
  /\b(process|processed|approve|approved|issue|issued|arrange|arranged)\s+(a\s+|the\s+|your\s+)?(refund|replacement|discount|compensation)\b/i,
  /\b(refund|replacement|discount|compensation)\b/i,
]

export const CATALOG_AMBIGUITY_THRESHOLD = 5

function hasHedgeOrPromise(text: string): boolean {
  return HEDGE_OR_PROMISE_PATTERNS.some(pattern => pattern.test(text))
}

export function isConfidenceCalibrationShadowMode(): boolean {
  return process.env.CONFIDENCE_CALIBRATION_SHADOW?.trim().toLowerCase() !== 'false'
}

export function downgradeForAmbiguity(
  confidence: AiConfidence,
  catalogMatchCount: number,
  intent: AiIntent
): AiConfidence {
  if (
    confidence === 'high' &&
    CATALOG_INTENTS.has(intent) &&
    catalogMatchCount >= CATALOG_AMBIGUITY_THRESHOLD
  ) {
    return 'medium'
  }

  return confidence
}

export function downgradeForMissingOrderContext(
  confidence: AiConfidence,
  orderMatchCount: number,
  intent: AiIntent,
  sourceCited: string | null
): AiConfidence {
  if (
    confidence === 'high' &&
    ORDER_INTENTS.has(intent) &&
    orderMatchCount === 0 &&
    (sourceCited == null || sourceCited === 'order_history')
  ) {
    return 'medium'
  }

  return confidence
}

export function calibrateConfidence(params: {
  confidence: AiConfidence
  intent: AiIntent
  shouldEscalate: boolean
  sourceCited: string | null
  catalogMatchCount: number
  text: string
}): { confidence: AiConfidence; promoted: boolean; blockedReason: string | null } {
  if (params.confidence !== 'medium') {
    return {
      confidence: params.confidence,
      promoted: false,
      blockedReason: 'not_medium',
    }
  }

  if (params.shouldEscalate) {
    return {
      confidence: params.confidence,
      promoted: false,
      blockedReason: 'should_escalate',
    }
  }

  if (!CALIBRATION_PROMOTE_INTENTS.has(params.intent)) {
    return {
      confidence: params.confidence,
      promoted: false,
      blockedReason: 'intent_not_allowed',
    }
  }

  if (params.sourceCited == null) {
    return {
      confidence: params.confidence,
      promoted: false,
      blockedReason: 'missing_source',
    }
  }

  if (CATALOG_INTENTS.has(params.intent) && params.catalogMatchCount !== 1) {
    return {
      confidence: params.confidence,
      promoted: false,
      blockedReason: 'catalog_match_count',
    }
  }

  if (hasHedgeOrPromise(params.text)) {
    return {
      confidence: params.confidence,
      promoted: false,
      blockedReason: 'hedge_or_promise',
    }
  }

  return {
    confidence: 'high',
    promoted: true,
    blockedReason: null,
  }
}

export function canAutoSend(params: {
  autoSendEnabled: boolean | null | undefined
  confidence: AiConfidence
  intent: AiIntent
}): boolean {
  return (
    params.autoSendEnabled === true &&
    params.confidence === 'high' &&
    !BLOCKED_AUTO_SEND_INTENTS.has(params.intent)
  )
}
