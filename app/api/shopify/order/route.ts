import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ORG_ID = '00000000-0000-0000-0000-000000000001'

export const dynamic = 'force-dynamic'

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured')
  }
  return createClient(supabaseUrl, supabaseKey)
}

interface ShopifyMoneyV2 {
  amount: string
  currencyCode: string
}

interface ShopifyOrderGql {
  id: string
  name: string
  displayFinancialStatus: string
  displayFulfillmentStatus: string
  createdAt: string
  totalPriceSet: { shopMoney: ShopifyMoneyV2 }
  customer: { firstName?: string; lastName?: string; email?: string; phone?: string } | null
  shippingAddress: { address1?: string; city?: string; country?: string } | null
  lineItems: {
    edges: {
      node: {
        title: string
        quantity: number
        originalUnitPriceSet: { shopMoney: ShopifyMoneyV2 }
        variant: { image: { url: string } | null } | null
      }
    }[]
  }
}

const ORDER_QUERY = `
  query GetOrder($id: ID!) {
    order(id: $id) {
      id
      name
      displayFinancialStatus
      displayFulfillmentStatus
      createdAt
      totalPriceSet {
        shopMoney { amount currencyCode }
      }
      customer {
        firstName
        lastName
        email
        phone
      }
      shippingAddress {
        address1
        city
        country
      }
      lineItems(first: 20) {
        edges {
          node {
            title
            quantity
            originalUnitPriceSet {
              shopMoney { amount currencyCode }
            }
            variant {
              image { url }
            }
          }
        }
      }
    }
  }
`

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const conversationId = searchParams.get('conversationId')

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
    }

    const supabase = getSupabase()

    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .select('store_id, external_id, channel')
      .eq('id', conversationId)
      .eq('organization_id', ORG_ID)
      .single<{ store_id: string; external_id: string; channel: string }>()

    if (convErr || !conv || conv.channel !== 'shopify') {
      return NextResponse.json({ error: 'Shopify conversation not found' }, { status: 404 })
    }

    const { data: platform, error: platErr } = await supabase
      .from('store_platforms')
      .select('access_token, shopify_domain')
      .eq('store_id', conv.store_id)
      .eq('organization_id', ORG_ID)
      .eq('platform_id', 'shopify')
      .single<{ access_token: string; shopify_domain: string }>()

    if (platErr || !platform) {
      return NextResponse.json({ error: 'Shopify connection not found' }, { status: 404 })
    }

    const gid = `gid://shopify/Order/${conv.external_id}`
    const gqlRes = await fetch(`https://${platform.shopify_domain}/admin/api/2026-04/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': platform.access_token,
      },
      body: JSON.stringify({
        query: ORDER_QUERY,
        variables: { id: gid },
      }),
    })

    const gqlData = await gqlRes.json() as { data?: { order?: ShopifyOrderGql }; errors?: unknown[] }

    if (!gqlRes.ok || !gqlData.data?.order) {
      console.error('Shopify order fetch failed:', gqlData.errors ?? gqlRes.statusText)
      return NextResponse.json({ error: 'Failed to fetch order from Shopify' }, { status: 502 })
    }

    return NextResponse.json({ order: gqlData.data.order })
  } catch (err) {
    console.error('Shopify order route error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
