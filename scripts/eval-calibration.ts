/**
 * Confidence calibration eval harness.
 *
 * Runs deterministic truth-table checks for the shadow-mode promotion layer.
 *
 * Usage:
 *   npm run eval:calibration
 */

import { calibrateConfidence } from '@/lib/autoSend'
import type { AiConfidence } from '@/lib/types'
import type { AiIntent } from '@/lib/aiRouter'

type CalibrationParams = Parameters<typeof calibrateConfidence>[0]
type CalibrationResult = ReturnType<typeof calibrateConfidence>

interface CalibrationCase {
  name: string
  params: CalibrationParams
  expected: CalibrationResult
}

const baseParams: CalibrationParams = {
  confidence: 'medium',
  intent: 'shipping',
  shouldEscalate: false,
  sourceCited: 'shipping_policy',
  catalogMatchCount: 0,
  text: 'Your order is on the way.',
}

function expected(
  confidence: AiConfidence,
  promoted: boolean,
  blockedReason: string | null
): CalibrationResult {
  return { confidence, promoted, blockedReason }
}

function blockedIntentCase(intent: AiIntent): CalibrationCase {
  return {
    name: `does not promote blocked/non-allowlisted intent: ${intent}`,
    params: {
      ...baseParams,
      intent,
      sourceCited: 'policy',
      catalogMatchCount: 1,
    },
    expected: expected('medium', false, 'intent_not_allowed'),
  }
}

const cases: CalibrationCase[] = [
  {
    name: 'promotes safe product question with one catalog match',
    params: {
      ...baseParams,
      intent: 'product_question',
      sourceCited: 'product_catalog',
      catalogMatchCount: 1,
      text: 'The blue shirt is available in size M.',
    },
    expected: expected('high', true, null),
  },
  {
    name: 'promotes safe shipping reply',
    params: {
      ...baseParams,
      intent: 'shipping',
      sourceCited: 'shipping_policy',
      catalogMatchCount: 3,
    },
    expected: expected('high', true, null),
  },
  {
    name: 'promotes safe order status reply',
    params: {
      ...baseParams,
      intent: 'order_status',
      sourceCited: 'conversation_history',
      text: 'Your order was marked delivered in the order details above.',
    },
    expected: expected('high', true, null),
  },
  {
    name: 'never promotes high confidence',
    params: {
      ...baseParams,
      confidence: 'high',
    },
    expected: expected('high', false, 'not_medium'),
  },
  {
    name: 'never promotes low confidence',
    params: {
      ...baseParams,
      confidence: 'low',
    },
    expected: expected('low', false, 'not_medium'),
  },
  {
    name: 'does not promote escalations',
    params: {
      ...baseParams,
      shouldEscalate: true,
    },
    expected: expected('medium', false, 'should_escalate'),
  },
  {
    name: 'does not promote without a cited source',
    params: {
      ...baseParams,
      sourceCited: null,
    },
    expected: expected('medium', false, 'missing_source'),
  },
  {
    name: 'does not promote catalog intent with zero matches',
    params: {
      ...baseParams,
      intent: 'product_question',
      sourceCited: 'product_catalog',
      catalogMatchCount: 0,
    },
    expected: expected('medium', false, 'catalog_match_count'),
  },
  {
    name: 'does not promote catalog intent with multiple matches',
    params: {
      ...baseParams,
      intent: 'product_question',
      sourceCited: 'product_catalog',
      catalogMatchCount: 2,
    },
    expected: expected('medium', false, 'catalog_match_count'),
  },
  {
    name: 'does not promote hedge replies',
    params: {
      ...baseParams,
      text: 'Let me check this and get back to you.',
    },
    expected: expected('medium', false, 'hedge_or_promise'),
  },
  {
    name: 'does not promote promise replies',
    params: {
      ...baseParams,
      text: 'I have processed your refund.',
    },
    expected: expected('medium', false, 'hedge_or_promise'),
  },
  blockedIntentCase('availability'),
  blockedIntentCase('pricing'),
  blockedIntentCase('refund'),
  blockedIntentCase('dispute'),
  blockedIntentCase('returns'),
]

let failures = 0

console.log('')
console.log('Confidence calibration eval')
console.log('')

for (const testCase of cases) {
  const actual = calibrateConfidence(testCase.params)
  const passed = actual.confidence === testCase.expected.confidence &&
    actual.promoted === testCase.expected.promoted &&
    actual.blockedReason === testCase.expected.blockedReason

  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${testCase.name}`)
  if (!passed) {
    failures += 1
    console.log(`  expected: ${JSON.stringify(testCase.expected)}`)
    console.log(`  actual:   ${JSON.stringify(actual)}`)
  }
}

console.log('')
console.log(`Results: ${cases.length - failures}/${cases.length} checks passed`)

if (failures > 0) {
  process.exit(1)
}
