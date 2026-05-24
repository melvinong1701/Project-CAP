import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// TODO: replace this with organization_id from a signed OAuth state once Shopify install starts from an authenticated store settings flow.
const ORG_ID = '00000000-0000-0000-0000-000000000001'

export const dynamic = 'force-dynamic'

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    return null
  }
  return createClient(supabaseUrl, supabaseKey)
}

function isValidShopDomain(shop: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)
}

function verifyHmac(query: URLSearchParams, secret: string): boolean {
  const hmac = query.get('hmac') ?? ''
  const params: string[] = []

  query.forEach((value, key) => {
    if (key !== 'hmac' && key !== 'signature') {
      params.push(`${key}=${value}`)
    }
  })

  params.sort()

  const message = params.join('&')
  const digest = crypto.createHmac('sha256', secret).update(message).digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac))
  } catch {
    return false
  }
}

const WEBHOOK_SUBSCRIPTION_CREATE_MUTATION = `
  mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription {
        id
        topic
        uri
      }
      userErrors {
        field
        message
      }
    }
  }
`

const SHOPIFY_WEBHOOK_TOPICS = [
  'ORDERS_CREATE',
  'PRODUCTS_CREATE',
  'PRODUCTS_UPDATE',
  'PRODUCTS_DELETE',
] as const

type ShopifyWebhookTopic = typeof SHOPIFY_WEBHOOK_TOPICS[number]

async function registerShopifyWebhook(params: {
  shop: string
  accessToken: string
  topic: ShopifyWebhookTopic
  webhookUrl: string
}) {
  try {
    const webhookRes = await fetch(`https://${params.shop}/admin/api/2026-04/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': params.accessToken,
      },
      body: JSON.stringify({
        query: WEBHOOK_SUBSCRIPTION_CREATE_MUTATION,
        variables: {
          topic: params.topic,
          webhookSubscription: {
            uri: params.webhookUrl,
          },
        },
      }),
    })

    const webhookData = await webhookRes.json() as {
      data?: {
        webhookSubscriptionCreate?: {
          userErrors: { field?: string[]; message: string }[]
        }
      }
    }
    const userErrors = webhookData.data?.webhookSubscriptionCreate?.userErrors ?? []

    if (!webhookRes.ok || userErrors.length > 0) {
      console.error('Shopify webhook registration failed:', JSON.stringify({
        topic: params.topic,
        status: webhookRes.status,
        userErrors,
        rawData: webhookData,
      }))
    }
  } catch (err) {
    console.error('Shopify webhook registration failed:', {
      topic: params.topic,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    console.log('Shopify callback hit', {
      hasCode: !!searchParams.get('code'),
      hasState: !!searchParams.get('state'),
      hasHmac: !!searchParams.get('hmac'),
    })

    const shop = searchParams.get('shop')
    const code = searchParams.get('code')
    const state = searchParams.get('state')

    if (!shop || !code || !state) {
      return NextResponse.json({ error: 'Missing required params' }, { status: 400 })
    }

    if (!isValidShopDomain(shop)) {
      return NextResponse.json({ error: 'Invalid shop domain' }, { status: 400 })
    }

    const cookieState = req.cookies.get('shopify_oauth_state')?.value
    if (!cookieState || cookieState !== state) {
      return NextResponse.json({ error: 'Invalid state — possible CSRF' }, { status: 403 })
    }

    const storeId = state.split(':').slice(1).join(':')
    if (!storeId) {
      return NextResponse.json({ error: 'Missing storeId in state' }, { status: 400 })
    }

    const clientId = process.env.SHOPIFY_CLIENT_ID
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!clientId || !clientSecret || !appUrl) {
      console.error('Missing env vars: SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, or NEXT_PUBLIC_APP_URL')
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
    }

    if (!verifyHmac(searchParams, clientSecret)) {
      return NextResponse.json({ error: 'HMAC verification failed' }, { status: 403 })
    }

    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    })
    const tokenData = await tokenRes.json() as { access_token?: string; error?: string }

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('Shopify token exchange failed:', tokenData.error ?? tokenRes.statusText)
      return NextResponse.json({ error: 'Failed to obtain access token' }, { status: 502 })
    }

    const supabase = getSupabase()
    if (!supabase) {
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
    }

    const { error: dbErr } = await supabase
      .from('store_platforms')
      .upsert(
        {
          store_id: storeId,
          organization_id: ORG_ID,
          platform_id: 'shopify',
          account_label: shop,
          access_token: tokenData.access_token,
          shopify_domain: shop,
        },
        { onConflict: 'store_id,platform_id' }
      )

    if (dbErr) {
      console.error('Failed to save Shopify connection:', dbErr)
      return NextResponse.json({ error: 'Failed to save connection' }, { status: 500 })
    }

    const webhookUrl = `${appUrl}/api/shopify/webhook?storeId=${encodeURIComponent(storeId)}`
    for (const topic of SHOPIFY_WEBHOOK_TOPICS) {
      await registerShopifyWebhook({
        shop,
        accessToken: tokenData.access_token,
        topic,
        webhookUrl,
      })
    }

    const cookieHeader = req.headers.get('cookie')
    fetch(`${appUrl}/api/shopify/sync-products?storeId=${encodeURIComponent(storeId)}`, {
      method: 'POST',
      headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
      redirect: 'manual',
    })
      .then(res => {
        if (!res.ok) {
          console.error('Product sync trigger failed:', { status: res.status })
        }
      })
      .catch(err => console.error('Product sync trigger failed:', err))

    const response = NextResponse.redirect(`${appUrl}/`)
    response.cookies.set('shopify_oauth_state', '', { maxAge: 0, path: '/' })
    return response
  } catch (err) {
    console.error('Shopify callback unhandled error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
