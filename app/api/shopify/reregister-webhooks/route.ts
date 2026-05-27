import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SHOPIFY_WEBHOOK_TOPICS, registerShopifyWebhook } from '@/lib/shopifyWebhooks'

export const dynamic = 'force-dynamic'

interface ShopifyPlatformRow {
  access_token: string | null
  shopify_domain: string | null
}

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured')
  }
  return createClient(supabaseUrl, supabaseKey)
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')

    if (!storeId) {
      return NextResponse.json({ error: 'storeId required' }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl) {
      return NextResponse.json({ error: 'NEXT_PUBLIC_APP_URL not configured' }, { status: 500 })
    }

    const supabase = getSupabase()
    const { data: platform, error } = await supabase
      .from('store_platforms')
      .select('shopify_domain, access_token')
      .eq('store_id', storeId)
      .eq('platform_id', 'shopify')
      .maybeSingle<ShopifyPlatformRow>()

    if (error) {
      throw new Error(error.message)
    }

    if (!platform) {
      return NextResponse.json({ error: 'Shopify not connected for this store' }, { status: 404 })
    }

    if (!platform.shopify_domain || !platform.access_token) {
      return NextResponse.json({ error: 'Shopify connection is missing credentials' }, { status: 500 })
    }

    const webhookUrl = `${appUrl}/api/shopify/webhook?storeId=${encodeURIComponent(storeId)}`
    for (const topic of SHOPIFY_WEBHOOK_TOPICS) {
      await registerShopifyWebhook({
        shop: platform.shopify_domain,
        accessToken: platform.access_token,
        topic,
        webhookUrl,
      })
    }

    return NextResponse.json({ ok: true, topics: [...SHOPIFY_WEBHOOK_TOPICS] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    console.error('Shopify re-register webhooks error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
