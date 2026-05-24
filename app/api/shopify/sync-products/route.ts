import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/getOrgId'
import { ShopifyGraphqlProduct, shopifyProductToRow } from '@/lib/shopifyProductSync'

const PAGE_SIZE = 50

export const dynamic = 'force-dynamic'

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured')
  }
  return createClient(supabaseUrl, supabaseKey)
}

interface PageInfo {
  hasNextPage: boolean
  endCursor: string | null
}

interface ProductsPage {
  products: {
    pageInfo: PageInfo
    edges: { node: ShopifyGraphqlProduct }[]
  }
}

interface ShopifyPlatformRow {
  organization_id: string
  access_token: string
  shopify_domain: string
}

type SyncStatus = 'in_progress' | 'success' | 'failed'

async function updateSyncState(params: {
  organizationId: string
  storeId: string
  status: SyncStatus
  productCount?: number
  lastSyncedAt?: string
  lastSyncError?: string | null
}) {
  const supabase = getSupabase()
  const now = new Date().toISOString()
  const updates: {
    last_sync_status: SyncStatus
    updated_at: string
    product_count?: number
    last_synced_at?: string
    last_sync_error?: string | null
  } = {
    last_sync_status: params.status,
    updated_at: now,
  }

  if (params.productCount !== undefined) updates.product_count = params.productCount
  if (params.lastSyncedAt !== undefined) updates.last_synced_at = params.lastSyncedAt
  if (params.lastSyncError !== undefined) updates.last_sync_error = params.lastSyncError

  const { data, error } = await supabase
    .from('store_product_sync_state')
    .update(updates)
    .eq('organization_id', params.organizationId)
    .eq('store_id', params.storeId)
    .eq('platform_id', 'shopify')
    .select('store_id')
    .returns<{ store_id: string }[]>()

  if (error) {
    console.error('Failed to update product sync state:', error)
    return
  }

  if ((data ?? []).length > 0) {
    return
  }

  const insertRow: {
    organization_id: string
    store_id: string
    platform_id: 'shopify'
    last_sync_status: SyncStatus
    product_count: number
    updated_at: string
    last_synced_at?: string
    last_sync_error?: string | null
  } = {
    organization_id: params.organizationId,
    store_id: params.storeId,
    platform_id: 'shopify',
    last_sync_status: params.status,
    product_count: params.productCount ?? 0,
    updated_at: now,
  }

  if (params.lastSyncedAt !== undefined) insertRow.last_synced_at = params.lastSyncedAt
  if (params.lastSyncError !== undefined) insertRow.last_sync_error = params.lastSyncError

  const { error: insertError } = await supabase
    .from('store_product_sync_state')
    .insert(insertRow)

  if (insertError) {
    console.error('Failed to insert product sync state:', insertError)
  }
}

function truncateSyncError(error: string) {
  return error.slice(0, 500)
}

const PRODUCTS_QUERY = `
  query GetProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          descriptionHtml
          productType
          tags
          status
          variants(first: 10) {
            edges { node { id title price sku availableForSale } }
          }
          images(first: 5) {
            edges { node { url altText } }
          }
        }
      }
    }
  }
`

export async function POST(req: NextRequest) {
  let syncContext: { organizationId: string; storeId: string } | null = null

  try {
    const ctx = await requireAuth()
    if (ctx instanceof NextResponse) return ctx
    const ORG_ID = ctx.organizationId

    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')

    if (!storeId) {
      return NextResponse.json({ error: 'storeId required' }, { status: 400 })
    }

    const supabase = getSupabase()

    const { data: platform, error: platErr } = await supabase
      .from('store_platforms')
      .select('organization_id, access_token, shopify_domain')
      .eq('store_id', storeId)
      .eq('organization_id', ORG_ID)
      .eq('platform_id', 'shopify')
      .single<ShopifyPlatformRow>()

    if (platErr || !platform) {
      return NextResponse.json({ error: 'Shopify connection not found' }, { status: 404 })
    }

    let cursor: string | null = null
    let totalSynced = 0

    syncContext = { organizationId: ORG_ID, storeId }
    await updateSyncState({
      organizationId: ORG_ID,
      storeId,
      status: 'in_progress',
    })

    while (true) {
      const gqlRes = await fetch(`https://${platform.shopify_domain}/admin/api/2026-04/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': platform.access_token,
        },
        body: JSON.stringify({
          query: PRODUCTS_QUERY,
          variables: { first: PAGE_SIZE, after: cursor },
        }),
      })

      const gqlData = await gqlRes.json() as { data?: ProductsPage; errors?: unknown[] }

      if (!gqlRes.ok || !gqlData.data?.products) {
        console.error('Shopify products fetch failed:', gqlData.errors ?? gqlRes.statusText)
        await updateSyncState({
          organizationId: ORG_ID,
          storeId,
          status: 'failed',
          lastSyncError: truncateSyncError('Failed to fetch products from Shopify'),
        })
        return NextResponse.json(
          { error: 'Failed to fetch products from Shopify', synced: totalSynced },
          { status: 502 }
        )
      }

      const { pageInfo, edges } = gqlData.data.products
      const rows = edges.map(({ node }) => shopifyProductToRow(node, ORG_ID, storeId))

      if (rows.length > 0) {
        const { error: upsertErr } = await supabase
          .from('store_products')
          .upsert(rows, { onConflict: 'organization_id,store_id,platform_id,external_product_id' })

        if (upsertErr) {
          console.error('Failed to upsert products:', upsertErr)
          await updateSyncState({
            organizationId: ORG_ID,
            storeId,
            status: 'failed',
            lastSyncError: truncateSyncError(upsertErr.message),
          })
          return NextResponse.json({ error: 'DB upsert failed', synced: totalSynced }, { status: 500 })
        }

        totalSynced += rows.length
      }

      if (!pageInfo.hasNextPage || !pageInfo.endCursor) {
        break
      }

      cursor = pageInfo.endCursor
    }

    await updateSyncState({
      organizationId: ORG_ID,
      storeId,
      status: 'success',
      productCount: totalSynced,
      lastSyncedAt: new Date().toISOString(),
      lastSyncError: null,
    })

    return NextResponse.json({ ok: true, synced: totalSynced })
  } catch (err) {
    console.error('Shopify sync-products error:', err)
    if (syncContext) {
      await updateSyncState({
        organizationId: syncContext.organizationId,
        storeId: syncContext.storeId,
        status: 'failed',
        lastSyncError: truncateSyncError(err instanceof Error ? err.message : String(err)),
      })
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
