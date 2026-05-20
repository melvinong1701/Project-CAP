import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ORG_ID = '00000000-0000-0000-0000-000000000001'
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

interface ProductVariant {
  id: string
  title: string
  price: string
  sku: string | null
  availableForSale: boolean
}

interface ProductImage {
  url: string
  altText: string | null
}

interface ShopifyProduct {
  id: string
  title: string
  descriptionHtml: string
  productType: string
  tags: string[]
  status: string
  variants: { edges: { node: ProductVariant }[] }
  images: { edges: { node: ProductImage }[] }
}

interface PageInfo {
  hasNextPage: boolean
  endCursor: string | null
}

interface ProductsPage {
  products: {
    pageInfo: PageInfo
    edges: { node: ShopifyProduct }[]
  }
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
  try {
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')

    if (!storeId) {
      return NextResponse.json({ error: 'storeId required' }, { status: 400 })
    }

    const supabase = getSupabase()

    const { data: platform, error: platErr } = await supabase
      .from('store_platforms')
      .select('access_token, shopify_domain')
      .eq('store_id', storeId)
      .eq('organization_id', ORG_ID)
      .eq('platform_id', 'shopify')
      .single<{ access_token: string; shopify_domain: string }>()

    if (platErr || !platform) {
      return NextResponse.json({ error: 'Shopify connection not found' }, { status: 404 })
    }

    let cursor: string | null = null
    let totalSynced = 0

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
        return NextResponse.json(
          { error: 'Failed to fetch products from Shopify', synced: totalSynced },
          { status: 502 }
        )
      }

      const { pageInfo, edges } = gqlData.data.products
      const rows = edges.map(({ node }) => ({
        organization_id: ORG_ID,
        store_id: storeId,
        platform_id: 'shopify',
        external_product_id: node.id,
        title: node.title,
        description: node.descriptionHtml || null,
        product_type: node.productType || null,
        tags: node.tags,
        status: node.status,
        variants: node.variants.edges.map(edge => edge.node),
        images: node.images.edges.map(edge => edge.node),
        raw_payload: node,
        synced_at: new Date().toISOString(),
      }))

      if (rows.length > 0) {
        const { error: upsertErr } = await supabase
          .from('store_products')
          .upsert(rows, { onConflict: 'organization_id,store_id,platform_id,external_product_id' })

        if (upsertErr) {
          console.error('Failed to upsert products:', upsertErr)
          return NextResponse.json({ error: 'DB upsert failed', synced: totalSynced }, { status: 500 })
        }

        totalSynced += rows.length
      }

      if (!pageInfo.hasNextPage || !pageInfo.endCursor) {
        break
      }

      cursor = pageInfo.endCursor
    }

    return NextResponse.json({ ok: true, synced: totalSynced })
  } catch (err) {
    console.error('Shopify sync-products error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
