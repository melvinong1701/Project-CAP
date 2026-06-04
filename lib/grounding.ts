import { type SupabaseClient } from '@supabase/supabase-js'
import {
  type ConversationContextMessage,
  type PreprocessingResult,
  type RetrievedContextSnippet,
  type RetrievedContextSource,
} from '@/lib/aiRouter'
import {
  CATALOG_INTENTS,
  buildCatalogSearchQuery,
  fetchCatalogContext,
} from '@/lib/catalogRetrieval'
import {
  KNOWLEDGE_INTENTS,
  buildKnowledgeSearchQuery,
  fetchKnowledgeContext,
} from '@/lib/knowledgeRetrieval'
import { ORDER_INTENTS, fetchOrderContext } from '@/lib/orderRetrieval'

const GROUNDING_SNIPPET_LIMIT = 5

export interface GroundingContext {
  snippets: RetrievedContextSnippet[]
  catalogMatchCount: number
  knowledgeMatchCount: number
  orderMatchCount: number
}

function countSource(snippets: RetrievedContextSnippet[], source: RetrievedContextSource): number {
  return snippets.filter(snippet => snippet.source === source).length
}

function toGroundingContext(snippets: RetrievedContextSnippet[]): GroundingContext {
  const cappedSnippets = snippets.slice(0, GROUNDING_SNIPPET_LIMIT)

  return {
    snippets: cappedSnippets,
    catalogMatchCount: countSource(cappedSnippets, 'product_catalog'),
    knowledgeMatchCount: countSource(cappedSnippets, 'knowledge_base'),
    orderMatchCount: countSource(cappedSnippets, 'order_history'),
  }
}

export async function assembleGroundingContext(params: {
  supabase: SupabaseClient
  organizationId: string
  storeId: string | null
  customerId: string | null
  preprocessing: PreprocessingResult
  latestMessage: string
  history: ConversationContextMessage[]
  providedContext?: RetrievedContextSnippet[]
}): Promise<GroundingContext> {
  if (params.providedContext?.length) {
    return toGroundingContext(params.providedContext)
  }

  const catalogContext = params.storeId && CATALOG_INTENTS.has(params.preprocessing.intent)
    ? await fetchCatalogContext(
      params.supabase,
      params.organizationId,
      params.storeId,
      buildCatalogSearchQuery(params.preprocessing, params.latestMessage, params.history)
    )
    : []
  const knowledgeContext = params.storeId && KNOWLEDGE_INTENTS.has(params.preprocessing.intent)
    ? await fetchKnowledgeContext(
      params.supabase,
      params.organizationId,
      params.storeId,
      buildKnowledgeSearchQuery(params.preprocessing, params.latestMessage)
    )
    : []
  const orderContext = params.customerId && ORDER_INTENTS.has(params.preprocessing.intent)
    ? await fetchOrderContext(params.supabase, params.organizationId, params.customerId)
    : []

  return toGroundingContext([
    ...orderContext,
    ...catalogContext,
    ...knowledgeContext,
  ])
}
