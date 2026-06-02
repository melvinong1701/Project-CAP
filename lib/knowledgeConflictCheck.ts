import { AI_MODEL_ROUTER, callOpenAiJson } from '@/lib/aiRouter'

interface KnowledgeConflictInput {
  candidate: { title: string; body: string }
  existing: { id: string; kind: 'policy' | 'faq'; title: string; body: string }[]
}

export type KnowledgeConflictResult =
  | { conflict: false }
  | { conflict: true; conflictsWithId: string; explanation: string }

const knowledgeConflictCheckTimeoutMs = 8000

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Knowledge conflict check timed out')), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}

export async function checkKnowledgeConflict(input: KnowledgeConflictInput): Promise<KnowledgeConflictResult> {
  if (input.existing.length === 0) {
    return { conflict: false }
  }

  const existingIds = new Set(input.existing.map(entry => entry.id))
  const system = [
    'You compare ecommerce store knowledge entries before they are saved.',
    'Knowledge entries may be policies or FAQs.',
    'Flag a conflict only when the candidate and an existing active entry govern the same subject with incompatible rules, regardless of whether each entry is a policy or FAQ.',
    'Examples of genuine contradictions: different return windows, free returns versus paid returns, refundable versus non-refundable, or contradictory eligibility.',
    'Do not flag mere topical overlap, complementary entries, duplicates with the same meaning, wording differences, or entries that can both be true.',
    'If multiple entries conflict, return the single strongest conflict.',
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
          existingActiveEntries: input.existing,
        },
        maxCompletionTokens: 300,
      }),
      knowledgeConflictCheckTimeoutMs
    )

    if (raw.conflict !== true) {
      return { conflict: false }
    }

    const conflictsWithId = asString(raw.conflictsWithId)
    if (!existingIds.has(conflictsWithId)) {
      return { conflict: false }
    }

    const explanation = asString(raw.explanation) || 'This entry conflicts with an existing active knowledge entry.'

    return {
      conflict: true,
      conflictsWithId,
      explanation,
    }
  } catch (err) {
    console.error('Knowledge conflict check failed open:', err)
    return { conflict: false }
  }
}
