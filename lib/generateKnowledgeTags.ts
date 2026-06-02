import { AI_MODEL_ROUTER, callOpenAiJson } from '@/lib/aiRouter'

interface GenerateKnowledgeTagsInput {
  kind: 'policy' | 'faq'
  title: string
  body: string
}

const generateKnowledgeTagsTimeoutMs = 7000
const blockedTags = new Set(['policy', 'faq', 'info', 'general'])

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Knowledge tag generation timed out')), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}

function sanitizeGeneratedTags(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<string>()
  const tags: string[] = []

  for (const item of value) {
    if (typeof item !== 'string') continue

    const tag = item.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!tag || blockedTags.has(tag) || seen.has(tag)) continue
    if (tag.split(' ').length > 2) continue

    seen.add(tag)
    tags.push(tag)

    if (tags.length === 6) break
  }

  return tags
}

export async function generateKnowledgeTags(input: GenerateKnowledgeTagsInput): Promise<string[]> {
  const system = [
    'You extract topical tags for ecommerce store knowledge entries.',
    'Return strict JSON only: { "tags": string[] }.',
    'Extract 3 to 6 concise, lowercase tags from the entry title and body.',
    'Each tag must be one or two words describing the subject, such as returns, refund, exchange, shipping, delivery, or tracking.',
    'Do not emit sentences, duplicates, store names, or the words policy, faq, info, or general.',
  ].join(' ')

  try {
    const raw = await withTimeout(
      callOpenAiJson({
        model: AI_MODEL_ROUTER.preprocessing,
        system,
        user: {
          kind: input.kind,
          title: input.title,
          body: input.body,
        },
        maxCompletionTokens: 120,
      }),
      generateKnowledgeTagsTimeoutMs
    )

    return sanitizeGeneratedTags(raw.tags)
  } catch (err) {
    console.error('Knowledge tag generation failed open:', err)
    return []
  }
}
