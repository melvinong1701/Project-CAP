import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { encryptSecret } from '@/lib/credentialCrypto'
import { SHOPIFY_WEBHOOK_TOPICS, registerShopifyWebhook } from '@/lib/shopifyWebhooks'

export const dynamic = 'force-dynamic'

interface StoreRow {
  organization_id: string
}

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
    const accessToken = tokenData.access_token

    const supabase = getSupabase()
    if (!supabase) {
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
    }

    const { data: store, error: storeErr } = await supabase
      .from('stores')
      .select('organization_id')
      .eq('id', storeId)
      .single<StoreRow>()

    if (storeErr || !store) {
      console.error('Shopify callback: store not found for storeId', { storeId })
      return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    }
    const organizationId = store.organization_id

    const { error: dbErr } = await supabase
      .from('store_platforms')
      .upsert(
        {
          store_id: storeId,
          organization_id: organizationId,
          platform_id: 'shopify',
          account_label: shop,
          access_token: encryptSecret(accessToken),
          shopify_domain: shop,
        },
        { onConflict: 'store_id,platform_id' }
      )

    if (dbErr) {
      console.error('Failed to save Shopify connection:', dbErr)
      return NextResponse.json({ error: 'Failed to save connection' }, { status: 500 })
    }

    const webhookUrl = `${appUrl}/api/shopify/webhook?storeId=${encodeURIComponent(storeId)}`
    const webhookResults = await Promise.allSettled(
      SHOPIFY_WEBHOOK_TOPICS.map(topic =>
        registerShopifyWebhook({
          shop,
          accessToken,
          topic,
          webhookUrl,
        })
      )
    )
    webhookResults.forEach((result, i) => {
      if (result.status === 'rejected') {
        console.error(`Shopify webhook registration failed for ${SHOPIFY_WEBHOOK_TOPICS[i]}:`, result.reason)
      }
    })

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
