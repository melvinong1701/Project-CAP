import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ORG_ID = '00000000-0000-0000-0000-000000000001'

interface StoreRow {
  id: string
  name: string
  country: string
  language: string
  currency: string
}

interface StorePlatformRow {
  store_id: string
  platform_id: string
  account_label: string | null
}

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel env vars')
  }
  return createClient(supabaseUrl, supabaseKey)
}

export async function GET() {
  try {
    const supabase = getSupabase()
    const { data: stores, error: storesError } = await supabase
      .from('stores')
      .select('id, name, country, language, currency')
      .eq('organization_id', ORG_ID)
      .order('created_at')
      .returns<StoreRow[]>()

    if (storesError) {
      console.error('Fetch stores error:', storesError)
      return NextResponse.json({ error: 'Failed to fetch stores' }, { status: 500 })
    }

    const storeIds = stores.map(store => store.id)
    let platforms: StorePlatformRow[] = []

    if (storeIds.length > 0) {
      const { data: platformRows, error: platformsError } = await supabase
        .from('store_platforms')
        .select('store_id, platform_id, account_label')
        .in('store_id', storeIds)
        .eq('organization_id', ORG_ID)
        .returns<StorePlatformRow[]>()

      if (platformsError) {
        console.error('Fetch store platforms error:', platformsError)
        return NextResponse.json({ error: 'Failed to fetch store platforms' }, { status: 500 })
      }

      platforms = platformRows
    }

    return NextResponse.json({ stores, platforms })
  } catch (err) {
    console.error('Stores GET error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>
    const { name, country, language, currency } = body

    if (
      typeof name !== 'string' ||
      typeof country !== 'string' ||
      typeof language !== 'string' ||
      typeof currency !== 'string' ||
      !name.trim()
    ) {
      return NextResponse.json({ error: 'Store name, country, language, and currency are required' }, { status: 400 })
    }

    const supabase = getSupabase()
    const { data: store, error } = await supabase
      .from('stores')
      .insert({
        organization_id: ORG_ID,
        name: name.trim(),
        country,
        language,
        currency,
      })
      .select('id, name, country, language, currency')
      .single<StoreRow>()

    if (error || !store) {
      console.error('Add store error:', error)
      return NextResponse.json({ error: 'Failed to save store' }, { status: 500 })
    }

    return NextResponse.json({ store })
  } catch (err) {
    console.error('Stores POST error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')

    if (!storeId) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 })
    }

    const supabase = getSupabase()
    const { error } = await supabase
      .from('stores')
      .delete()
      .eq('id', storeId)
      .eq('organization_id', ORG_ID)

    if (error) {
      console.error('Delete store error:', error)
      return NextResponse.json({ error: 'Failed to delete store' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Stores DELETE error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
