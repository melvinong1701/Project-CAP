import type { AiConfidence } from '@/lib/types'
import type { AiIntent } from '@/lib/aiRouter'
import { CATALOG_INTENTS } from '@/lib/catalogRetrieval'

const BLOCKED_AUTO_SEND_INTENTS = new Set<AiIntent>([
  'availability',
  'pricing',
  'refund',
  'dispute',
  'returns',
])

export const CATALOG_AMBIGUITY_THRESHOLD = 5

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
