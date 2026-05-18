import { NextRequest, NextResponse } from 'next/server'
import { ORG_ID, getSupabaseAdmin, isUuid } from '../../../_utils'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: { id: string }
}

export async function POST(_req: NextRequest, { params }: RouteContext) {
  try {
    if (!isUuid(params.id)) {
      return NextResponse.json({ error: 'Merge suggestion not found' }, { status: 404 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('customer_merge_suggestions')
      .update({
        status: 'dismissed',
        reviewed_by: 'staff',
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .eq('organization_id', ORG_ID)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle<{ id: string }>()

    if (error) {
      console.error('Dismiss merge suggestion error:', error)
      return NextResponse.json({ error: 'Failed to dismiss merge suggestion' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Merge suggestion not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Dismiss merge suggestion POST error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
