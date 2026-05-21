import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type CustomerChannel = 'telegram' | 'shopee' | 'lazada' | 'tiktok_shop'

export interface CustomerRow {
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
  total_orders: number | string | null
  total_spend: number | string | null
  first_seen_at: string | null
  last_contact_at: string | null
  tags: string[] | null
  merge_status: string
}

export interface MergeSuggestionRow {
  id: string
  organization_id: string
  profile_a_id: string
  profile_b_id: string
  reason: string
  confidence: string
  status: string
  created_at: string
}

export interface MergeRow {
  id: string
  source_id: string
  target_id: string
  merged_by: string
  snapshot: Record<string, unknown>
  created_at: string
}

export const customerSelect = [
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
  'total_orders',
  'total_spend',
  'first_seen_at',
  'last_contact_at',
  'tags',
  'merge_status',
].join(', ')

let supabaseAdmin: SupabaseClient | null = null

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel env vars')
  }

  if (!supabaseAdmin) {
    supabaseAdmin = createClient(supabaseUrl, supabaseKey)
  }

  return supabaseAdmin
}

export function toNumber(value: number | string | null | undefined) {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value) || 0
  return 0
}

export function getChannels(customer: Pick<CustomerRow, 'telegram_id' | 'shopee_buyer_id' | 'lazada_buyer_id' | 'tiktok_buyer_id'>): CustomerChannel[] {
  const channels: CustomerChannel[] = []
  if (customer.telegram_id) channels.push('telegram')
  if (customer.shopee_buyer_id) channels.push('shopee')
  if (customer.lazada_buyer_id) channels.push('lazada')
  if (customer.tiktok_buyer_id) channels.push('tiktok_shop')
  return channels
}

export function mapCustomerSummary(
  row: CustomerRow,
  extras: { conversationCount?: number; hasPendingMergeSuggestion?: boolean } = {}
) {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    phone: row.phone,
    channels: getChannels(row),
    conversationCount: extras.conversationCount ?? 0,
    totalOrders: toNumber(row.total_orders),
    totalSpend: toNumber(row.total_spend),
    lastContactAt: row.last_contact_at,
    hasPendingMergeSuggestion: extras.hasPendingMergeSuggestion ?? false,
  }
}

export function mapCustomer(row: CustomerRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    displayName: row.display_name,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    telegramId: row.telegram_id,
    shopeeBuyerId: row.shopee_buyer_id,
    lazadaBuyerId: row.lazada_buyer_id,
    tiktokBuyerId: row.tiktok_buyer_id,
    totalOrders: toNumber(row.total_orders),
    totalSpend: toNumber(row.total_spend),
    firstSeenAt: row.first_seen_at,
    lastContactAt: row.last_contact_at,
    tags: row.tags ?? [],
    mergeStatus: row.merge_status,
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function cleanText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function cleanTags(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter((tag): tag is string => typeof tag === 'string')
    .map(tag => tag.trim())
    .filter(Boolean)
    .slice(0, 20)
}

export function compactSearchTerm(value: string) {
  return value.trim().replace(/[,%]/g, ' ').replace(/\s+/g, ' ')
}
