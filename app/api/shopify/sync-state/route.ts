import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/getOrgId'

export const dynamic = 'force-dynamic'

type SyncStatus = 'never' | 'in_progress' | 'success' | 'failed'

interface SyncStateRow {
  last_synced_at: string | null
  product_count: number
  last_sync_status: SyncStatus
  last_sync_error: string | null
}

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured')
  }
  return createClient(supabaseUrl, supabaseKey)
}

function defaultSyncState() {
  return {
    lastSyncedAt: null,
    productCount: 0,
    lastSyncStatus: 'never' as SyncStatus,
    lastSyncError: null,
  }
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    if (ctx instanceof NextResponse) return ctx
    const ORG_ID = ctx.organizationId

    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')

    if (!storeId) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 })
    }

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('store_product_sync_state')
      .select('last_synced_at, product_count, last_sync_status, last_sync_error')
      .eq('organization_id', ORG_ID)
      .eq('store_id', storeId)
      .eq('platform_id', 'shopify')
      .maybeSingle<SyncStateRow>()

    if (error) {
      console.error('Fetch Shopify sync state error:', error)
      return NextResponse.json({ error: 'Failed to fetch sync state' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ data: defaultSyncState() })
    }

    return NextResponse.json({
      data: {
        lastSyncedAt: data.last_synced_at,
        productCount: data.product_count,
        lastSyncStatus: data.last_sync_status,
        lastSyncError: data.last_sync_error,
      },
    })
  } catch (err) {
    console.error('Shopify sync-state GET error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
