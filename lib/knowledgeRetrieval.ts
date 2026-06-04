import { type SupabaseClient } from '@supabase/supabase-js'
import {
  type AiIntent,
  type PreprocessingResult,
  type RetrievedContextSnippet,
  type RetrievedContextSource,
} from '@/lib/aiRouter'

export const KNOWLEDGE_INTENTS = new Set<AiIntent>(['shipping', 'returns', 'other'])

const KNOWLEDGE_CONTEXT_SOURCE: RetrievedContextSource = 'knowledge_base'
const MAX_KNOWLEDGE_SEARCH_QUERY_LENGTH = 240
const KNOWLEDGE_SEARCH_LIMIT = 5

interface KnowledgeRow {
  kind: 'policy' | 'faq'
  title: string
  body: string
  tags: string[] | null
}

export async function fetchKnowledgeContext(
  supabase: SupabaseClient,
  organizationId: string,
  storeId: string,
  query: string
): Promise<RetrievedContextSnippet[]> {
  const { data, error } = await supabase
    .rpc('search_store_knowledge', {
      p_organization_id: organizationId,
      p_store_id: storeId,
      p_query: query,
      p_limit: KNOWLEDGE_SEARCH_LIMIT,
    })

  if (error || !data) {
    console.error('Knowledge search error:', error)
    return []
  }

  return (data as KnowledgeRow[]).map((row) => ({
    title: row.title,
    content: [
      `Kind: ${row.kind}`,
      row.tags?.length ? `Tags: ${row.tags.join(', ')}` : null,
      row.body,
    ]
      .filter(Boolean)
      .join('. '),
    source: KNOWLEDGE_CONTEXT_SOURCE,
  }))
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

export function buildKnowledgeSearchQuery(
  preprocessing: PreprocessingResult,
  latestMessage: string
): string {
  const currentQuery = preprocessing.tags.length > 0
    ? preprocessing.tags.join(' ')
    : latestMessage

  return truncateSearchText(currentQuery, MAX_KNOWLEDGE_SEARCH_QUERY_LENGTH)
}
