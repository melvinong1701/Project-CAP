import { type SupabaseClient } from '@supabase/supabase-js'
import {
  type AiIntent,
  type ConversationContextMessage,
  type PreprocessingResult,
  type RetrievedContextSnippet,
} from '@/lib/aiRouter'

export const CATALOG_INTENTS = new Set<AiIntent>(['product_question', 'pricing', 'availability'])

const MAX_CATALOG_SEARCH_QUERY_LENGTH = 240
const MAX_CATALOG_CARRY_QUERY_LENGTH = 120
const CATALOG_SEARCH_LIMIT = 8
const GENERIC_CATALOG_TAGS = new Set([
  'about',
  'and',
  'are',
  'available',
  'availability',
  'beige',
  'black',
  'blue',
  'brown',
  'color',
  'colors',
  'colour',
  'colours',
  'cost',
  'could',
  'does',
  'for',
  'gray',
  'green',
  'grey',
  'gold',
  'have',
  'hello',
  'how',
  'item',
  'items',
  'large',
  'looking',
  'medium',
  'much',
  'navy',
  'need',
  'one',
  'ones',
  'option',
  'options',
  'orange',
  'pink',
  'please',
  'price',
  'pricing',
  'product',
  'products',
  'purple',
  'red',
  'same',
  'silver',
  'size',
  'sizes',
  'small',
  'stock',
  'thank',
  'thanks',
  'that',
  'the',
  'there',
  'these',
  'this',
  'those',
  'variant',
  'variants',
  'white',
  'with',
  'would',
  'want',
  'yellow',
  'you',
  'xs',
  'xl',
  'xxl',
])

interface ProductRow {
  title: string
  product_type: string | null
  tags: string[] | null
  status: string | null
  variants: { title: string; price: string; sku: string | null; availableForSale: boolean }[]
}

function isDefaultVariantTitle(title: string): boolean {
  return title.trim().toLowerCase() === 'default title'
}

function formatVariantSummary(
  variant: ProductRow['variants'][number],
  totalVariants: number
): string {
  const availabilitySuffix = variant.availableForSale ? '' : ' (unavailable)'
  if (isDefaultVariantTitle(variant.title)) {
    return totalVariants === 1
      ? `Price: ${variant.price}${availabilitySuffix}`
      : `${variant.price}${availabilitySuffix}`
  }

  return `${variant.title} — ${variant.price}${availabilitySuffix}`
}

function formatVariantContent(variantSummary: string, hasSingleDefaultVariant: boolean): string {
  if (!variantSummary) {
    return 'No variants listed'
  }

  return hasSingleDefaultVariant ? variantSummary : `Variants: ${variantSummary}`
}

export async function fetchCatalogContext(
  supabase: SupabaseClient,
  organizationId: string,
  storeId: string,
  query: string
): Promise<RetrievedContextSnippet[]> {
  const { data, error } = await supabase
    .rpc('search_store_products', {
      p_organization_id: organizationId,
      p_store_id: storeId,
      p_query: query,
      p_limit: CATALOG_SEARCH_LIMIT,
    })

  if (error || !data) {
    console.error('Catalog search error:', error)
    return []
  }

  return (data as ProductRow[]).map((product) => {
    const hasSingleDefaultVariant = product.variants.length === 1 && isDefaultVariantTitle(product.variants[0].title)
    const variantSummary = product.variants
      .map((variant) => formatVariantSummary(variant, product.variants.length))
      .join(', ')
    const variantContent = formatVariantContent(variantSummary, hasSingleDefaultVariant)

    const content = [
      product.product_type ? `Type: ${product.product_type}` : null,
      product.status ? `Status: ${product.status}` : null,
      product.tags?.length ? `Tags: ${product.tags.join(', ')}` : null,
      variantContent,
    ]
      .filter(Boolean)
      .join('. ')

    return {
      title: product.title,
      content,
      source: 'product_catalog',
    }
  })
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

function normalizeCatalogToken(value: string): string {
  return value.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
}

function isSpecificCatalogToken(value: string): boolean {
  const token = normalizeCatalogToken(value)
  if (!token) {
    return false
  }

  if (/\d/.test(token)) {
    return true
  }

  return token.length >= 3 && !GENERIC_CATALOG_TAGS.has(token)
}

function hasSpecificCatalogTag(tags: string[]): boolean {
  return tags.some(tag => tag.split(/\s+/).some(isSpecificCatalogToken))
}

function findMostRecentPriorCustomerTurn(
  history: ConversationContextMessage[],
  latestMessage: string
): string | null {
  const normalizedLatest = compactSearchText(latestMessage).toLowerCase()

  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i]
    if (message.sender !== 'customer') {
      continue
    }

    const content = compactSearchText(message.content)
    if (!content || content.toLowerCase() === normalizedLatest) {
      continue
    }

    if (!content.split(/\s+/).some(isSpecificCatalogToken)) {
      continue
    }

    return truncateSearchText(content, MAX_CATALOG_CARRY_QUERY_LENGTH)
  }

  return null
}

function combineCatalogSearchTerms(currentQuery: string, carriedQuery: string | null): string {
  const current = truncateSearchText(currentQuery, MAX_CATALOG_SEARCH_QUERY_LENGTH)
  if (!carriedQuery) {
    return current
  }

  const remainingLength = MAX_CATALOG_SEARCH_QUERY_LENGTH - current.length - 1
  if (remainingLength <= 0) {
    return current
  }

  const carry = truncateSearchText(
    carriedQuery,
    Math.min(MAX_CATALOG_CARRY_QUERY_LENGTH, remainingLength)
  )

  return compactSearchText(`${current} ${carry}`)
}

export function buildCatalogSearchQuery(
  preprocessing: PreprocessingResult,
  latestMessage: string,
  history: ConversationContextMessage[]
): string {
  const currentQuery = preprocessing.tags.length > 0
    ? preprocessing.tags.join(' ')
    : latestMessage

  // If the current turn only has generic terms like a colour, size, or "price",
  // carry the last customer product mention as secondary retrieval context.
  const carriedQuery = hasSpecificCatalogTag(preprocessing.tags)
    ? null
    : findMostRecentPriorCustomerTurn(history, latestMessage)

  return combineCatalogSearchTerms(currentQuery, carriedQuery)
}
