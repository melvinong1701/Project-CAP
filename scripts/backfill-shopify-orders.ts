import { loadEnvConfig } from '@next/env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  type ShopifyOrder,
  shopifyOrderToCustomerOrderRow,
  upsertShopifyCustomerOrder,
} from '@/lib/shopifyOrders'
import { decryptSecret } from '@/lib/credentialCrypto'
import { normalizePhone } from '@/lib/phone'

loadEnvConfig(process.cwd())

const SHOPIFY_API_VERSION = '2024-01'
const PAGE_LIMIT = 250
const PAGE_DELAY_MS = 500

interface ShopifyStoreRow {
  store_id: string
  organization_id: string
  access_token: string | null
  shopify_domain: string | null
}

interface ResolvedStore {
  storeId: string
  organizationId: string
  accessToken: string
  shopifyDomain: string
}

interface ShopifyOrdersResponse {
  orders?: ShopifyOrder[]
}

interface CustomerRow {
  id: string
}

interface CustomerOrderTotalRow {
  total_amount: number | string | null
}

interface AffectedCustomer {
  organizationId: string
  customerId: string
}

interface StoreBackfillResult {
  upserted: number
  skipped: number
  affectedCustomers: Map<string, AffectedCustomer>
}

const allowedFlags = new Set(['--dry-run', '--help'])
const passedFlags = process.argv.slice(2)
const dryRun = passedFlags.includes('--dry-run')
const shouldPrintHelp = passedFlags.includes('--help')

for (const flag of passedFlags) {
  if (!allowedFlags.has(flag)) {
    console.error(`Unknown flag: ${flag}`)
    printUsage()
    process.exit(1)
  }
}

function getSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local')
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

async function discoverStores(supabase: SupabaseClient): Promise<ResolvedStore[]> {
  const { data, error } = await supabase
    .from('store_platforms')
    .select('store_id, organization_id, access_token, shopify_domain')
    .eq('platform_id', 'shopify')
    .not('access_token', 'is', null)
    .not('shopify_domain', 'is', null)
    .returns<ShopifyStoreRow[]>()

  if (error) {
    throw new Error(`Failed to discover Shopify stores: ${error.message}`)
  }

  return (data ?? []).flatMap(row => {
    const accessToken = decryptSecret(row.access_token)?.trim()
    const shopifyDomain = row.shopify_domain?.trim()

    if (!accessToken || !shopifyDomain) return []

    return [{
      storeId: row.store_id,
      organizationId: row.organization_id,
      accessToken,
      shopifyDomain: cleanShopifyDomain(shopifyDomain),
    }]
  })
}

async function fetchAllOrders(store: ResolvedStore): Promise<ShopifyOrder[]> {
  const orders: ShopifyOrder[] = []
  let page = 1
  let nextUrl: string | null = buildInitialOrdersUrl(store.shopifyDomain)

  console.log(`[store ${store.storeId} / org ${store.organizationId}] Fetching orders from Shopify...`)

  while (nextUrl) {
    const { orders: pageOrders, nextUrl: followingUrl } = await fetchOrdersPage(nextUrl, store.accessToken)
    orders.push(...pageOrders)

    console.log(
      `[store ${store.storeId} / org ${store.organizationId}] Page ${page}: ${pageOrders.length} orders${followingUrl ? '' : ' - done'}`
    )

    nextUrl = followingUrl
    page += 1

    if (nextUrl) {
      await delay(PAGE_DELAY_MS)
    }
  }

  return orders
}

async function fetchOrdersPage(url: string, accessToken: string): Promise<{ orders: ShopifyOrder[]; nextUrl: string | null }> {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Shopify-Access-Token': accessToken,
    },
  })

  const data = await res.json() as ShopifyOrdersResponse

  if (!res.ok) {
    throw new Error(`Shopify orders fetch failed (${res.status}): ${JSON.stringify(data).slice(0, 500)}`)
  }

  return {
    orders: data.orders ?? [],
    nextUrl: parseNextLink(res.headers.get('link')),
  }
}

async function backfillStore(
  supabase: SupabaseClient,
  store: ResolvedStore,
  orders: ShopifyOrder[]
): Promise<StoreBackfillResult> {
  let upserted = 0
  let skipped = 0
  const affectedCustomers = new Map<string, AffectedCustomer>()

  for (const order of orders) {
    const customerId = await resolveCustomerId(supabase, store.organizationId, order)

    if (!customerId) {
      skipped += 1
      console.warn(
        `[store ${store.storeId} / org ${store.organizationId}] Skipping Shopify order ${String(order.id)}: no customer match`
      )
      continue
    }

    if (dryRun) {
      const row = shopifyOrderToCustomerOrderRow({
        organizationId: store.organizationId,
        storeId: store.storeId,
        customerId,
        order,
      })
      console.log(
        `[dry-run] Would upsert order ${row.external_order_id} for customer ${customerId} (${row.status}, ${row.currency} ${row.total_amount})`
      )
    } else {
      const error = await upsertShopifyCustomerOrder(supabase, {
        organizationId: store.organizationId,
        storeId: store.storeId,
        customerId,
        order,
      })

      if (error) {
        throw new Error(`Failed to upsert Shopify order ${String(order.id)}: ${error.message}`)
      }
    }

    upserted += 1
    affectedCustomers.set(affectedCustomerKey(store.organizationId, customerId), {
      organizationId: store.organizationId,
      customerId,
    })
  }

  return { upserted, skipped, affectedCustomers }
}

async function resolveCustomerId(
  supabase: SupabaseClient,
  organizationId: string,
  order: ShopifyOrder
): Promise<string | null> {
  const email = order.customer?.email?.trim() || null

  if (email) {
    const customer = await findCustomerByColumn(supabase, organizationId, 'email', email)
    if (customer) return customer.id
  }

  const rawPhone = order.customer?.phone?.trim() || null
  if (!rawPhone) return null

  const customerCountry =
    order.customer?.default_address?.country_code ??
    order.billing_address?.country_code ??
    undefined
  const normalizedPhone = normalizePhone(rawPhone, customerCountry)
  const phoneCandidates = Array.from(new Set([normalizedPhone, rawPhone].filter((value): value is string => Boolean(value))))

  for (const phone of phoneCandidates) {
    const customer = await findCustomerByColumn(supabase, organizationId, 'phone', phone)
    if (customer) return customer.id
  }

  return null
}

async function findCustomerByColumn(
  supabase: SupabaseClient,
  organizationId: string,
  column: 'email' | 'phone',
  value: string
): Promise<CustomerRow | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('id')
    .eq('organization_id', organizationId)
    .eq(column, value)
    .limit(1)
    .maybeSingle<CustomerRow>()

  if (error) {
    throw new Error(`Failed to resolve customer by ${column}: ${error.message}`)
  }

  return data
}

async function recalculateRollup(
  supabase: SupabaseClient,
  affectedCustomer: AffectedCustomer
): Promise<void> {
  const { data, error } = await supabase
    .from('customer_orders')
    .select('total_amount')
    .eq('organization_id', affectedCustomer.organizationId)
    .eq('customer_id', affectedCustomer.customerId)
    .returns<CustomerOrderTotalRow[]>()

  if (error) {
    throw new Error(`Failed to fetch order totals for customer ${affectedCustomer.customerId}: ${error.message}`)
  }

  const orders = data ?? []
  const totalSpend = orders.reduce((sum, order) => sum + toNumber(order.total_amount), 0)

  const { error: updateError } = await supabase
    .from('customers')
    .update({
      total_orders: orders.length,
      total_spend: totalSpend,
    })
    .eq('id', affectedCustomer.customerId)
    .eq('organization_id', affectedCustomer.organizationId)

  if (updateError) {
    throw new Error(`Failed to update rollup for customer ${affectedCustomer.customerId}: ${updateError.message}`)
  }
}

async function recalculateRollups(
  supabase: SupabaseClient,
  affectedCustomers: Map<string, AffectedCustomer>
): Promise<void> {
  if (dryRun) {
    return
  }

  for (const affectedCustomer of Array.from(affectedCustomers.values())) {
    await recalculateRollup(supabase, affectedCustomer)
  }
}

function buildInitialOrdersUrl(shopifyDomain: string) {
  const url = new URL(`https://${shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/orders.json`)
  url.searchParams.set('status', 'any')
  url.searchParams.set('limit', String(PAGE_LIMIT))
  return url.toString()
}

function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null

  for (const link of linkHeader.split(',')) {
    const match = link.match(/<([^>]+)>;\s*rel="next"/)
    if (match?.[1]) {
      return match[1]
    }
  }

  return null
}

function cleanShopifyDomain(value: string) {
  return value.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

function affectedCustomerKey(organizationId: string, customerId: string) {
  return `${organizationId}:${customerId}`
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value) || 0
  return 0
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function printUsage() {
  console.log([
    'Usage:',
    '  npx tsx scripts/backfill-shopify-orders.ts [--dry-run]',
    '',
    'Options:',
    '  --dry-run  Fetch Shopify orders and resolve customers, but do not write to Supabase.',
    '  --help     Show this help text.',
  ].join('\n'))
}

async function main() {
  if (shouldPrintHelp) {
    printUsage()
    return
  }

  const supabase = getSupabase()
  const stores = await discoverStores(supabase)
  const allAffectedCustomers = new Map<string, AffectedCustomer>()
  let totalUpserted = 0
  let totalSkipped = 0

  if (dryRun) {
    console.log('Dry run enabled - no Supabase writes will be performed.')
  }

  if (stores.length === 0) {
    console.log('No connected Shopify stores found.')
    console.log('Backfill complete.')
    return
  }

  for (const store of stores) {
    const orders = await fetchAllOrders(store)
    const result = await backfillStore(supabase, store, orders)

    for (const [key, affectedCustomer] of Array.from(result.affectedCustomers.entries())) {
      allAffectedCustomers.set(key, affectedCustomer)
    }

    if (!dryRun) {
      await recalculateRollups(supabase, result.affectedCustomers)
    }

    totalUpserted += result.upserted
    totalSkipped += result.skipped

    console.log(
      `[store ${store.storeId} / org ${store.organizationId}] ${dryRun ? 'Would upsert' : 'Upserted'} ${result.upserted} orders, skipped ${result.skipped} (no customer match)`
    )
    console.log(
      `[store ${store.storeId} / org ${store.organizationId}] ${dryRun ? 'Would recalculate' : 'Recalculated'} rollups for ${result.affectedCustomers.size} customers`
    )
  }

  console.log(`${dryRun ? 'Dry run' : 'Backfill'} summary: ${totalUpserted} orders, ${totalSkipped} skipped, ${allAffectedCustomers.size} affected customers.`)
  console.log('Backfill complete.')
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
