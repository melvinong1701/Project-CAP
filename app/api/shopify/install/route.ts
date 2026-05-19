import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const SCOPES = 'read_orders,read_customers,read_products'

function isValidShopDomain(shop: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const shop = searchParams.get('shop')
  const storeId = searchParams.get('storeId')

  if (!shop || !storeId) {
    return NextResponse.json({ error: 'shop and storeId are required' }, { status: 400 })
  }

  if (!isValidShopDomain(shop)) {
    return NextResponse.json({ error: 'Invalid shop domain' }, { status: 400 })
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!clientId || !appUrl) {
    throw new Error('SHOPIFY_CLIENT_ID or NEXT_PUBLIC_APP_URL not configured')
  }

  const nonce = crypto.randomUUID()
  const state = `${nonce}:${storeId}`
  const redirectUri = `${appUrl}/api/shopify/callback`

  const authUrl = new URL(`https://${shop}/admin/oauth/authorize`)
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('state', state)

  const response = NextResponse.redirect(authUrl.toString())
  response.cookies.set('shopify_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return response
}
