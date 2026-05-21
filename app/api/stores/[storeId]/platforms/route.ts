import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/getOrgId'

interface StorePlatformRow {
  id: string
  store_id: string
  platform_id: string
  account_label: string | null
  organization_id: string
  created_at: string
}

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel env vars')
  }

  return createClient(supabaseUrl, supabaseKey)
}

export async function GET(
  _request: Request,
  { params }: { params: { storeId: string } }
) {
  try {
    const ctx = await requireAuth()
    if (ctx instanceof NextResponse) return ctx
    const ORG_ID = ctx.organizationId

    const supabase = getSupabase()
    const { data: platforms, error } = await supabase
      .from('store_platforms')
      .select('id, store_id, platform_id, account_label, organization_id, created_at')
      .eq('store_id', params.storeId)
      .eq('organization_id', ORG_ID)
      .order('created_at')
      .returns<StorePlatformRow[]>()

    if (error) {
      console.error('Fetch store platforms error:', error)
      return NextResponse.json({ error: 'Failed to fetch connected platforms' }, { status: 500 })
    }

    return NextResponse.json({ platforms })
  } catch (err) {
    console.error('Store platforms GET error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
