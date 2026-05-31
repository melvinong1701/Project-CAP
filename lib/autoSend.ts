import type { AiConfidence } from '@/lib/types'
import type { AiIntent } from '@/lib/aiRouter'

const BLOCKED_AUTO_SEND_INTENTS = new Set<AiIntent>([
  'availability',
  'pricing',
  'refund',
  'dispute',
  'returns',
])

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
