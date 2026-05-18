import type { SupabaseClient } from '@supabase/supabase-js'

type MergeConfidence = 'high' | 'medium' | 'low'
type MergeStatus = 'standalone' | 'primary' | 'merged_into'

type CustomerIdColumn =
  | 'telegram_id'
  | 'shopee_buyer_id'
  | 'lazada_buyer_id'
  | 'tiktok_buyer_id'

interface CustomerRow {
  id: string
  organization_id: string
  display_name: string | null
  email: string | null
  phone: string | null
  notes: string | null
  telegram_id: string | null
  shopee_buyer_id: string | null
  lazada_buyer_id: string | null
  tiktok_buyer_id: string | null
  first_seen_at: string | null
  last_contact_at: string | null
  total_orders: number | string | null
  total_spend: number | string | null
  tags: string[] | null
  merge_status: MergeStatus
  created_at: string
  updated_at?: string | null
}

interface SuggestionRow {
  id: string
}

interface ConversationStoreRow {
  customer_id: string | null
  store_id: string | null
}

interface MatchSignals {
  platformId?: CustomerIdColumn
  phone?: boolean
  email?: boolean
  closePhone?: boolean
  nameStoreTimeframe?: boolean
}

interface CandidateMatch {
  customer: CustomerRow
  signals: MatchSignals
  confidence: MergeConfidence
  reason: string
  autoLink: boolean
}

export interface IdentityResolutionInput {
  supabase: SupabaseClient
  organizationId: string
  customerId: string
  conversationId?: string | null
  storeId?: string | null
  lastContactAt?: string | Date | null
  orderDelta?: {
    count?: number
    spend?: number
  }
}

export type IdentityResolutionResult =
  | {
      action: 'auto_linked'
      customerId: string
      mergedCustomerId: string
      mergeId: string | null
      reason: string
    }
  | {
      action: 'suggestion_created'
      customerId: string
      suggestionIds: string[]
    }
  | {
      action: 'no_match'
      customerId: string
    }

const CUSTOMER_SELECT = [
  'id',
  'organization_id',
  'display_name',
  'email',
  'phone',
  'notes',
  'telegram_id',
  'shopee_buyer_id',
  'lazada_buyer_id',
  'tiktok_buyer_id',
  'first_seen_at',
  'last_contact_at',
  'total_orders',
  'total_spend',
  'tags',
  'merge_status',
  'created_at',
  'updated_at',
].join(', ')

const PLATFORM_ID_COLUMNS: CustomerIdColumn[] = [
  'telegram_id',
  'shopee_buyer_id',
  'lazada_buyer_id',
  'tiktok_buyer_id',
]

export async function resolveCustomerIdentity(
  input: IdentityResolutionInput
): Promise<IdentityResolutionResult> {
  const { supabase, organizationId, customerId } = input

  const { data: customer, error } = await supabase
    .from('customers')
    .select(CUSTOMER_SELECT)
    .eq('id', customerId)
    .eq('organization_id', organizationId)
    .single<CustomerRow>()

  if (error || !customer) {
    throw new Error('Customer not found for identity resolution')
  }

  if (customer.merge_status === 'merged_into') {
    return { action: 'no_match', customerId: customer.id }
  }

  await ensureConversationLinked(supabase, organizationId, customer.id, input.conversationId)

  const touchedCustomer = await touchCustomerMetrics(supabase, organizationId, customer, input)
  const matches = await findCandidateMatches(supabase, organizationId, touchedCustomer, input.storeId)
  const autoMatch = pickUnambiguousAutoMatch(matches)

  if (autoMatch) {
    return mergeCustomers({
      supabase,
      organizationId,
      source: touchedCustomer,
      target: autoMatch.customer,
      reason: autoMatch.reason,
    })
  }

  const suggestionIds: string[] = []
  for (const match of collapseMatchesByCustomer(matches)) {
    const suggestionId = await createMergeSuggestion({
      supabase,
      organizationId,
      sourceId: touchedCustomer.id,
      targetId: match.customer.id,
      reason: match.reason,
      confidence: match.confidence,
      signals: match.signals,
    })

    if (suggestionId) {
      suggestionIds.push(suggestionId)
    }
  }

  if (suggestionIds.length > 0) {
    return {
      action: 'suggestion_created',
      customerId: touchedCustomer.id,
      suggestionIds,
    }
  }

  return { action: 'no_match', customerId: touchedCustomer.id }
}

async function ensureConversationLinked(
  supabase: SupabaseClient,
  organizationId: string,
  customerId: string,
  conversationId?: string | null
): Promise<void> {
  if (!conversationId) return

  const { error } = await supabase
    .from('conversations')
    .update({ customer_id: customerId })
    .eq('id', conversationId)
    .eq('organization_id', organizationId)

  if (error) {
    throw new Error('Failed to link conversation during identity resolution')
  }
}

async function touchCustomerMetrics(
  supabase: SupabaseClient,
  organizationId: string,
  customer: CustomerRow,
  input: IdentityResolutionInput
): Promise<CustomerRow> {
  const patch: Partial<CustomerRow> = {}
  const lastContactAt = toIsoString(input.lastContactAt)

  if (lastContactAt && isAfter(lastContactAt, customer.last_contact_at)) {
    patch.last_contact_at = lastContactAt
  }

  if (input.orderDelta?.count) {
    patch.total_orders = toNumber(customer.total_orders) + input.orderDelta.count
  }

  if (input.orderDelta?.spend) {
    patch.total_spend = toNumber(customer.total_spend) + input.orderDelta.spend
  }

  if (Object.keys(patch).length === 0) {
    return customer
  }

  const { data, error } = await supabase
    .from('customers')
    .update(patch)
    .eq('id', customer.id)
    .eq('organization_id', organizationId)
    .select(CUSTOMER_SELECT)
    .single<CustomerRow>()

  if (error || !data) {
    throw new Error('Failed to update customer identity metrics')
  }

  return data
}

async function findCandidateMatches(
  supabase: SupabaseClient,
  organizationId: string,
  customer: CustomerRow,
  storeId?: string | null
): Promise<CandidateMatch[]> {
  const candidates = new Map<string, CustomerRow>()

  for (const column of PLATFORM_ID_COLUMNS) {
    const value = customer[column]
    if (!value) continue

    for (const row of await queryCustomers(supabase, organizationId, customer.id, column, value)) {
      candidates.set(row.id, row)
    }
  }

  if (customer.phone) {
    for (const row of await queryCustomers(supabase, organizationId, customer.id, 'phone', customer.phone)) {
      candidates.set(row.id, row)
    }

    for (const row of await queryCustomersWithPhone(supabase, organizationId, customer.id)) {
      candidates.set(row.id, row)
    }
  }

  if (customer.email) {
    for (const row of await queryCustomers(supabase, organizationId, customer.id, 'email', customer.email)) {
      candidates.set(row.id, row)
    }
  }

  if (customer.display_name) {
    for (const row of await queryCustomers(supabase, organizationId, customer.id, 'display_name', customer.display_name)) {
      candidates.set(row.id, row)
    }
  }

  const storeMatches = await findSameStoreCustomers(
    supabase,
    organizationId,
    customer.id,
    Array.from(candidates.keys()),
    storeId
  )

  return Array.from(candidates.values())
    .map((candidate) => scoreCandidate(customer, candidate, storeMatches.has(candidate.id)))
    .filter((match): match is CandidateMatch => match !== null)
}

async function queryCustomers(
  supabase: SupabaseClient,
  organizationId: string,
  currentCustomerId: string,
  column: CustomerIdColumn | 'phone' | 'email' | 'display_name',
  value: string
): Promise<CustomerRow[]> {
  const { data, error } = await supabase
    .from('customers')
    .select(CUSTOMER_SELECT)
    .eq('organization_id', organizationId)
    .neq('id', currentCustomerId)
    .neq('merge_status', 'merged_into')
    .eq(column, value)
    .limit(50)
    .returns<CustomerRow[]>()

  if (error) {
    throw new Error(`Failed to query customers by ${column}`)
  }

  return data ?? []
}

async function queryCustomersWithPhone(
  supabase: SupabaseClient,
  organizationId: string,
  currentCustomerId: string
): Promise<CustomerRow[]> {
  // Scaling debt: this is acceptable for beta-sized data, but should move to a
  // Postgres pg_trgm-backed similarity query before large customer imports.
  const { data, error } = await supabase
    .from('customers')
    .select(CUSTOMER_SELECT)
    .eq('organization_id', organizationId)
    .neq('id', currentCustomerId)
    .neq('merge_status', 'merged_into')
    .not('phone', 'is', null)
    .limit(500)
    .returns<CustomerRow[]>()

  if (error) {
    throw new Error('Failed to query customers for phone similarity')
  }

  return data ?? []
}

async function findSameStoreCustomers(
  supabase: SupabaseClient,
  organizationId: string,
  currentCustomerId: string,
  candidateIds: string[],
  inputStoreId?: string | null
): Promise<Set<string>> {
  if (candidateIds.length === 0) {
    return new Set()
  }

  const storeIds = new Set<string>()
  if (inputStoreId) {
    storeIds.add(inputStoreId)
  }

  if (storeIds.size === 0) {
    const { data, error } = await supabase
      .from('conversations')
      .select('customer_id, store_id')
      .eq('organization_id', organizationId)
      .eq('customer_id', currentCustomerId)
      .not('store_id', 'is', null)
      .returns<ConversationStoreRow[]>()

    if (error) {
      throw new Error('Failed to query current customer stores')
    }

    for (const row of data ?? []) {
      if (row.store_id) storeIds.add(row.store_id)
    }
  }

  if (storeIds.size === 0) {
    return new Set()
  }

  const { data, error } = await supabase
    .from('conversations')
    .select('customer_id, store_id')
    .eq('organization_id', organizationId)
    .in('customer_id', candidateIds)
    .in('store_id', Array.from(storeIds))
    .returns<ConversationStoreRow[]>()

  if (error) {
    throw new Error('Failed to query candidate customer stores')
  }

  return new Set((data ?? []).map((row) => row.customer_id).filter(isString))
}

function scoreCandidate(
  customer: CustomerRow,
  candidate: CustomerRow,
  sameStore: boolean
): CandidateMatch | null {
  const exactPlatformId = PLATFORM_ID_COLUMNS.find(
    (column) => Boolean(customer[column]) && customer[column] === candidate[column]
  )

  if (exactPlatformId) {
    return {
      customer: candidate,
      reason: `same ${exactPlatformId.replace(/_/g, ' ')}`,
      confidence: 'high',
      signals: { platformId: exactPlatformId },
      autoLink: true,
    }
  }

  const samePhone = Boolean(customer.phone) && customer.phone === candidate.phone
  const sameEmail = Boolean(customer.email) && customer.email === candidate.email

  if (samePhone && sameEmail) {
    return {
      customer: candidate,
      reason: 'same phone number and email',
      confidence: 'high',
      signals: { phone: true, email: true },
      autoLink: true,
    }
  }

  if (samePhone) {
    return {
      customer: candidate,
      reason: 'same phone number',
      confidence: 'medium',
      signals: { phone: true },
      autoLink: false,
    }
  }

  if (sameEmail) {
    return {
      customer: candidate,
      reason: 'same email address',
      confidence: 'medium',
      signals: { email: true },
      autoLink: false,
    }
  }

  const phoneDistance = editDistance(normalizePhone(customer.phone), normalizePhone(candidate.phone))
  if (phoneDistance === 1) {
    return {
      customer: candidate,
      reason: 'phone number differs by one digit',
      confidence: 'low',
      signals: { closePhone: true },
      autoLink: false,
    }
  }

  if (
    sameStore &&
    sameNormalizedText(customer.display_name, candidate.display_name) &&
    withinDays(identityTimestamp(customer), identityTimestamp(candidate), 30)
  ) {
    return {
      customer: candidate,
      reason: 'same name and store within 30 days',
      confidence: 'low',
      signals: { nameStoreTimeframe: true },
      autoLink: false,
    }
  }

  return null
}

function pickUnambiguousAutoMatch(matches: CandidateMatch[]): CandidateMatch | null {
  const autoMatches = matches.filter((match) => match.autoLink)
  if (autoMatches.length !== 1) {
    return null
  }

  return autoMatches[0]
}

function collapseMatchesByCustomer(matches: CandidateMatch[]): CandidateMatch[] {
  const priority: Record<MergeConfidence, number> = { high: 3, medium: 2, low: 1 }
  const byCustomer = new Map<string, CandidateMatch>()

  for (const match of matches) {
    const existing = byCustomer.get(match.customer.id)
    if (!existing || priority[match.confidence] > priority[existing.confidence]) {
      byCustomer.set(match.customer.id, { ...match, autoLink: false })
    }
  }

  return Array.from(byCustomer.values())
}

async function createMergeSuggestion(input: {
  supabase: SupabaseClient
  organizationId: string
  sourceId: string
  targetId: string
  reason: string
  confidence: MergeConfidence
  signals: MatchSignals
}): Promise<string | null> {
  const { supabase, organizationId, sourceId, targetId } = input

  const { data: existing, error: existingError } = await supabase
    .from('customer_merge_suggestions')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('status', 'pending')
    .or(
      `and(profile_a_id.eq.${sourceId},profile_b_id.eq.${targetId}),and(profile_a_id.eq.${targetId},profile_b_id.eq.${sourceId})`
    )
    .maybeSingle<SuggestionRow>()

  if (existingError) {
    throw new Error('Failed to check existing customer merge suggestion')
  }

  if (existing) {
    return null
  }

  const { data, error } = await supabase
    .from('customer_merge_suggestions')
    .insert({
      organization_id: organizationId,
      profile_a_id: sourceId,
      profile_b_id: targetId,
      reason: input.reason,
      match_signals: input.signals,
      confidence: input.confidence,
      status: 'pending',
    })
    .select('id')
    .single<SuggestionRow>()

  if (error || !data) {
    throw new Error('Failed to create customer merge suggestion')
  }

  return data.id
}

async function mergeCustomers(input: {
  supabase: SupabaseClient
  organizationId: string
  source: CustomerRow
  target: CustomerRow
  reason: string
}): Promise<IdentityResolutionResult> {
  const { supabase, organizationId, source, target } = input

  const { data: mergeId, error } = await supabase.rpc('merge_customers', {
    p_organization_id: organizationId,
    p_source_id: source.id,
    p_target_id: target.id,
    p_merged_by: 'system',
  })

  if (error) {
    throw new Error('Failed to merge customers atomically')
  }

  return {
    action: 'auto_linked',
    customerId: target.id,
    mergedCustomerId: source.id,
    mergeId: typeof mergeId === 'string' ? mergeId : null,
    reason: input.reason,
  }
}

function normalizePhone(phone: string | null): string {
  return phone?.replace(/\D/g, '') ?? ''
}

function editDistance(left: string, right: string): number {
  if (!left || !right) return Number.POSITIVE_INFINITY
  if (Math.abs(left.length - right.length) > 1) return Number.POSITIVE_INFINITY

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  const current = Array.from({ length: right.length + 1 }, () => 0)

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i
    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost
      )
    }

    for (let j = 0; j <= right.length; j += 1) {
      previous[j] = current[j]
    }
  }

  return previous[right.length]
}

function sameNormalizedText(left: string | null, right: string | null): boolean {
  return Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase())
}

function identityTimestamp(customer: CustomerRow): string {
  return customer.first_seen_at ?? customer.created_at
}

function withinDays(leftIso: string, rightIso: string, days: number): boolean {
  const left = new Date(leftIso).getTime()
  const right = new Date(rightIso).getTime()

  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return false
  }

  return Math.abs(left - right) <= days * 24 * 60 * 60 * 1000
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return value
}

function isAfter(leftIso: string, rightIso: string | null): boolean {
  if (!rightIso) return true
  return new Date(leftIso).getTime() > new Date(rightIso).getTime()
}

function toNumber(value: number | string | null): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}
