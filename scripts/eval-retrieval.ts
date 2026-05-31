/**
 * Retrieval eval harness.
 *
 * Runs labelled catalog retrieval cases against the linked Supabase database,
 * using the same query construction and p_limit: 8 retrieval path as production.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run eval:retrieval
 *
 * Optional:
 *   RETRIEVAL_EVAL_MIN_HIT_RATE=0.7
 *   RETRIEVAL_EVAL_ORGANIZATION_ID=...
 *   RETRIEVAL_EVAL_STORE_ID=...
 */

import { buildCatalogSearchQuery, fetchCatalogContext } from '@/lib/catalogRetrieval'
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin'
import type { PreprocessingResult, RetrievedContextSnippet } from '@/lib/aiRouter'
import {
  DEFAULT_RETRIEVAL_EVAL_ORGANIZATION_ID,
  DEFAULT_RETRIEVAL_EVAL_STORE_ID,
  DEFAULT_RETRIEVAL_EVAL_STORE_NAME,
  retrievalEvalCases,
  type RetrievalEvalCase,
} from './eval-retrieval.fixtures'

const DEFAULT_MIN_HIT_RATE = 0.7

interface ProductPreconditionRow {
  title: string
  status: string | null
}

type PreconditionStatus =
  | { ok: true; status: string | null }
  | { ok: false; reason: string }

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase()
}

function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function parseMinHitRate(): number {
  const rawValue = process.env.RETRIEVAL_EVAL_MIN_HIT_RATE
  if (!rawValue) {
    return DEFAULT_MIN_HIT_RATE
  }

  const parsed = Number(rawValue)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error('RETRIEVAL_EVAL_MIN_HIT_RATE must be a number between 0 and 1.')
  }

  return parsed
}

function buildPreprocessing(testCase: RetrievalEvalCase): PreprocessingResult {
  return {
    language: 'en',
    intent: 'product_question',
    sentiment: 'neutral',
    urgency: 'low',
    tags: testCase.preprocessingTags ?? [],
    shouldEscalate: false,
    escalationReason: null,
  }
}

function includesTitle(titles: string[], expectedTitle: string): boolean {
  const expected = normalizeTitle(expectedTitle)
  return titles.some((title) => normalizeTitle(title) === expected)
}

function getForbiddenTitles(): string[] {
  return Array.from(new Set(
    retrievalEvalCases
      .map((testCase) => testCase.forbiddenProductTitle)
      .filter((title): title is string => Boolean(title))
  ))
}

async function fetchNoLeakPreconditions(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  organizationId: string,
  storeId: string
): Promise<Map<string, PreconditionStatus>> {
  const forbiddenTitles = getForbiddenTitles()
  const preconditions = new Map<string, PreconditionStatus>()

  if (forbiddenTitles.length === 0) {
    return preconditions
  }

  const { data, error } = await supabase
    .from('store_products')
    .select('title, status')
    .eq('organization_id', organizationId)
    .eq('store_id', storeId)
    .in('title', forbiddenTitles)
    .returns<ProductPreconditionRow[]>()

  if (error) {
    throw error
  }

  const rowsByTitle = new Map<string, ProductPreconditionRow[]>()
  for (const row of data) {
    const normalizedTitle = normalizeTitle(row.title)
    rowsByTitle.set(normalizedTitle, [...(rowsByTitle.get(normalizedTitle) ?? []), row])
  }

  for (const title of forbiddenTitles) {
    const matchingRows = rowsByTitle.get(normalizeTitle(title)) ?? []
    if (matchingRows.length === 0) {
      preconditions.set(title, {
        ok: false,
        reason: `PRECONDITION FAILED: '${title}' must exist as a non-active product to validate no-leak; row was not found.`,
      })
      continue
    }

    const activeRow = matchingRows.find((row) => row.status?.toLowerCase() === 'active')
    if (activeRow) {
      preconditions.set(title, {
        ok: false,
        reason: `PRECONDITION FAILED: '${title}' must exist as a non-active product to validate no-leak; current status is '${activeRow.status ?? 'null'}'.`,
      })
      continue
    }

    preconditions.set(title, { ok: true, status: matchingRows[0].status })
  }

  return preconditions
}

function scoreCase(testCase: RetrievalEvalCase, snippets: RetrievedContextSnippet[]): boolean {
  const returnedTitles = snippets.map((snippet) => snippet.title)
  const hasForbiddenTitle = testCase.forbiddenProductTitle
    ? includesTitle(returnedTitles, testCase.forbiddenProductTitle)
    : false

  if (hasForbiddenTitle) {
    return false
  }

  if (testCase.expectedProductTitle === null) {
    return testCase.forbiddenProductTitle ? true : returnedTitles.length === 0
  }

  if (testCase.expectedTopRank === 1) {
    const firstTitle = returnedTitles[0]
    return firstTitle ? normalizeTitle(firstTitle) === normalizeTitle(testCase.expectedProductTitle) : false
  }

  return includesTitle(returnedTitles, testCase.expectedProductTitle)
}

function formatExpectation(testCase: RetrievalEvalCase): string {
  if (testCase.expectedProductTitle === null && testCase.forbiddenProductTitle) {
    return `forbidden: ${testCase.forbiddenProductTitle}`
  }

  if (testCase.expectedProductTitle === null) {
    return 'expected: no rows'
  }

  return testCase.expectedTopRank === 1
    ? `expected top-1: ${testCase.expectedProductTitle}`
    : `expected top-8: ${testCase.expectedProductTitle}`
}

async function main() {
  const minHitRate = parseMinHitRate()
  const organizationId = process.env.RETRIEVAL_EVAL_ORGANIZATION_ID
    ?? DEFAULT_RETRIEVAL_EVAL_ORGANIZATION_ID
  const storeId = process.env.RETRIEVAL_EVAL_STORE_ID
    ?? DEFAULT_RETRIEVAL_EVAL_STORE_ID

  const supabase = createSupabaseAdminClient()
  const noLeakPreconditions = await fetchNoLeakPreconditions(supabase, organizationId, storeId)
  let hits = 0
  let retrievalFailures = 0
  let preconditionFailures = 0

  console.log('')
  console.log(`Retrieval eval - ${DEFAULT_RETRIEVAL_EVAL_STORE_NAME}`)
  console.log(`Store: ${storeId}`)
  console.log(`Minimum hit-rate: ${formatPercentage(minHitRate)}`)
  console.log('RPC limit: 8')
  console.log('')

  for (const testCase of retrievalEvalCases) {
    const preprocessing = buildPreprocessing(testCase)
    const history = testCase.history ?? []
    const pQuery = buildCatalogSearchQuery(preprocessing, testCase.query, history)
    const snippets = await fetchCatalogContext(supabase, organizationId, storeId, pQuery)
    const precondition = testCase.forbiddenProductTitle
      ? noLeakPreconditions.get(testCase.forbiddenProductTitle)
      : null
    const preconditionFailed = precondition?.ok === false
    const passed = preconditionFailed ? false : scoreCase(testCase, snippets)
    const returnedTitles = snippets.map((snippet) => snippet.title)

    if (passed) {
      hits += 1
    } else if (preconditionFailed) {
      preconditionFailures += 1
    } else {
      retrievalFailures += 1
    }

    const statusLabel = preconditionFailed ? 'PRECONDITION FAILED' : passed ? 'PASS' : 'FAIL'
    console.log(`[${statusLabel}] ${testCase.name}`)
    console.log(`  query: ${testCase.query}`)
    console.log(`  p_query: ${pQuery}`)
    console.log(`  ${formatExpectation(testCase)}`)
    console.log(`  returned: ${returnedTitles.length > 0 ? returnedTitles.join(' | ') : '(none)'}`)
    if (precondition?.ok === true) {
      console.log(`  precondition: '${testCase.forbiddenProductTitle}' exists with status '${precondition.status ?? 'null'}'`)
    } else if (precondition?.ok === false) {
      console.log(`  ${precondition.reason}`)
    }
    if (testCase.note) {
      console.log(`  note: ${testCase.note}`)
    }
    console.log('')
  }

  const total = retrievalEvalCases.length
  const hitRate = total > 0 ? hits / total : 0

  console.log(`Results: ${hits}/${total} hits, hit-rate ${formatPercentage(hitRate)}`)
  if (retrievalFailures > 0) {
    console.log(`Retrieval failures: ${retrievalFailures}`)
  }
  if (preconditionFailures > 0) {
    console.log(`Precondition failures: ${preconditionFailures}`)
  }

  if (preconditionFailures > 0) {
    console.error('Precondition failure detected; retrieval eval integrity is not valid.')
    process.exit(1)
  }

  if (hitRate < minHitRate) {
    console.error(`Hit-rate below floor: ${formatPercentage(hitRate)} < ${formatPercentage(minHitRate)}`)
    process.exit(1)
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`ERROR: ${message}`)
  process.exit(1)
})
