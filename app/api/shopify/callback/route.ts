import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const ORG_ID = '00000000-0000-0000-0000-000000000001'

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured')
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
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
    throw new Error('Shopify credentials not configured')
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
  const webhookRes = await fetch(`https://${shop}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': tokenData.access_token,
    },
    body: JSON.stringify({
      query: `
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
      `,
      variables: {
        topic: 'ORDERS_CREATE',
        webhookSubscription: {
          uri: webhookUrl,
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
    console.error('Failed to register Shopify webhook:', userErrors)
    return NextResponse.json({ error: 'Failed to register webhook' }, { status: 502 })
  }

  const response = NextResponse.redirect(`${appUrl}/`)
  response.cookies.set('shopify_oauth_state', '', { maxAge: 0, path: '/' })
  return response
}
