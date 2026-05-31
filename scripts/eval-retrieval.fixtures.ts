import type { ConversationContextMessage } from '@/lib/aiRouter'

export const DEFAULT_RETRIEVAL_EVAL_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001'
export const DEFAULT_RETRIEVAL_EVAL_STORE_ID = '9bf92836-008d-42ad-90fa-064f49d8c46f'
export const DEFAULT_RETRIEVAL_EVAL_STORE_NAME = 'Oak & Sand SG'

// Baseline against the linked Oak & Sand SG store on 2026-06-01:
// 14 / 14 hits, 100.0% hit-rate, using p_limit: 8 and production query construction.
export interface RetrievalEvalCase {
  name: string
  query: string
  expectedProductTitle: string | null
  expectedTopRank?: 1
  forbiddenProductTitle?: string
  preprocessingTags?: string[]
  history?: ConversationContextMessage[]
  note?: string
}

export const retrievalEvalCases: RetrievalEvalCase[] = [
  {
    name: 'Exact title - Hydrogen',
    query: 'The Collection Snowboard: Hydrogen',
    expectedProductTitle: 'The Collection Snowboard: Hydrogen',
    expectedTopRank: 1,
    note: 'Exact active product title match.',
  },
  {
    name: 'Exact title - Gift Card',
    query: 'Gift Card',
    expectedProductTitle: 'Gift Card',
    expectedTopRank: 1,
    note: 'Exact non-snowboard product title match.',
  },
  {
    name: 'Misspelled title - Hydrogen',
    query: 'The Collection Snowbord Hydragen',
    expectedProductTitle: 'The Collection Snowboard: Hydrogen',
    note: 'One-character title misspellings exercise trigram fallback when FTS cannot hit precisely.',
  },
  {
    name: 'Misspelled title - Videographer',
    query: 'videogrpher snowbord',
    expectedProductTitle: 'The Videographer Snowboard',
    note: 'Typo-heavy distinctive title query.',
  },
  {
    name: 'Variant-only term - Cosmic Purple',
    query: 'Cosmic Purple snowboard',
    expectedProductTitle: 'The 3p Fulfilled Snowboard',
    expectedTopRank: 1,
    note: 'Cosmic Purple exists only as a variant title on the 3p fulfilled snowboard.',
  },
  {
    name: 'Variant-only term - Dawn',
    query: 'Dawn snowboard',
    expectedProductTitle: 'The Complete Snowboard',
    expectedTopRank: 1,
    note: 'Dawn exists only as a variant title on the complete snowboard.',
  },
  {
    name: 'Natural phrasing - Oxygen price',
    query: 'how much is the oxygen snowboard',
    expectedProductTitle: 'The Collection Snowboard: Oxygen',
    expectedTopRank: 1,
    note: 'Natural price phrasing should still resolve the precise product.',
  },
  {
    name: 'Natural phrasing - Ski Wax',
    query: 'do you sell ski wax',
    expectedProductTitle: 'Selling Plans Ski Wax',
    expectedTopRank: 1,
    note: 'Natural product question for an accessory.',
  },
  {
    name: 'Precise multi-term - Multi-managed',
    query: 'multi managed snowboard',
    expectedProductTitle: 'The Multi-managed Snowboard',
    expectedTopRank: 1,
    note: 'Locks in Tier 1 AND-tsquery precision for a specific multi-term title.',
  },
  {
    name: 'Precise multi-term - Compare at Price',
    query: 'compare at price snowboard',
    expectedProductTitle: 'The Compare at Price Snowboard',
    expectedTopRank: 1,
    note: 'Another precise multi-term title with generic snowboard overlap.',
  },
  {
    name: 'Context carry - blue Hydrogen variant',
    query: 'Is the blue one available?',
    preprocessingTags: ['blue'],
    history: [
      {
        sender: 'customer',
        content: 'I am looking at The Collection Snowboard: Hydrogen',
      },
    ],
    expectedProductTitle: 'The Collection Snowboard: Hydrogen',
    note: 'A generic colour turn should carry the prior product mention into p_query.',
  },
  {
    name: 'Active-only filter - Draft no leak',
    query: 'The Draft Snowboard',
    expectedProductTitle: null,
    forbiddenProductTitle: 'The Draft Snowboard',
    note: 'The draft product may match the query but must not be returned.',
  },
  {
    name: 'Active-only filter - Archived no leak',
    query: 'The Archived Snowboard',
    expectedProductTitle: null,
    forbiddenProductTitle: 'The Archived Snowboard',
    note: 'The archived product may match the query but must not be returned.',
  },
  {
    name: 'Negative - unrelated product',
    query: 'carbon fiber skateboard helmet',
    expectedProductTitle: null,
    note: 'A query outside the catalog should return no products.',
  },
]
