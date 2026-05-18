import { NextRequest, NextResponse } from 'next/server'
import { ORG_ID, getSupabaseAdmin, isUuid } from '../_utils'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>
    const { sourceId, targetId } = body

    if (!isUuid(sourceId) || !isUuid(targetId)) {
      return NextResponse.json({ error: 'sourceId and targetId are required' }, { status: 400 })
    }

    if (sourceId === targetId) {
      return NextResponse.json({ error: 'Cannot merge a customer into itself' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: mergeId, error } = await supabase.rpc('merge_customers', {
      p_organization_id: ORG_ID,
      p_source_id: sourceId,
      p_target_id: targetId,
      p_merged_by: 'staff',
    })

    if (error) {
      console.error('Manual merge RPC error:', error)
      return NextResponse.json({ error: 'Failed to merge customers' }, { status: 500 })
    }

    return NextResponse.json({
      mergeId: typeof mergeId === 'string' ? mergeId : String(mergeId),
      survivingCustomerId: targetId,
    })
  } catch (err) {
    console.error('Manual merge POST error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
