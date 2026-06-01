import { AI_MODEL_ROUTER, callOpenAiJson } from '@/lib/aiRouter'

interface PolicyConflictInput {
  candidate: { title: string; body: string }
  existing: { id: string; title: string; body: string }[]
}

export type PolicyConflictResult =
  | { conflict: false }
  | { conflict: true; conflictsWithId: string; explanation: string }

const policyConflictCheckTimeoutMs = 8000

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Policy conflict check timed out')), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}

export async function checkPolicyConflict(input: PolicyConflictInput): Promise<PolicyConflictResult> {
  if (input.existing.length === 0) {
    return { conflict: false }
  }

  const existingIds = new Set(input.existing.map(policy => policy.id))
  const system = [
    'You compare ecommerce store policies before they are saved.',
    'Flag a conflict only when the candidate and an existing active policy govern the same subject with incompatible rules.',
    'Examples of genuine contradictions: different return windows, free returns versus paid returns, refundable versus non-refundable, or contradictory eligibility.',
    'Do not flag mere topical overlap, complementary policies, duplicates with the same meaning, wording differences, or policies that can both be true.',
    'If multiple policies conflict, return the single strongest conflict.',
    'Return strict JSON only: { "conflict": boolean, "conflictsWithId": string|null, "explanation": string }.',
    'When conflict is true, explanation must be one sentence naming both values that clash.',
  ].join(' ')

  try {
    const raw = await withTimeout(
      callOpenAiJson({
        model: AI_MODEL_ROUTER.replyDefault,
        system,
        user: {
          candidate: input.candidate,
          existingActivePolicies: input.existing,
        },
        maxCompletionTokens: 220,
      }),
      policyConflictCheckTimeoutMs
    )

    if (raw.conflict !== true) {
      return { conflict: false }
    }

    const conflictsWithId = asString(raw.conflictsWithId)
    if (!existingIds.has(conflictsWithId)) {
      return { conflict: false }
    }

    const explanation = asString(raw.explanation) || 'This policy conflicts with an existing active policy.'

    return {
      conflict: true,
      conflictsWithId,
      explanation,
    }
  } catch (err) {
    console.error('Policy conflict check failed open:', err)
    return { conflict: false }
  }
}
