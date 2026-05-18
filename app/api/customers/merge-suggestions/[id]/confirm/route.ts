import { NextRequest, NextResponse } from 'next/server'
import { ORG_ID, getSupabaseAdmin, isUuid, type MergeSuggestionRow } from '../../../_utils'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: { id: string }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    if (!isUuid(params.id)) {
      return NextResponse.json({ error: 'Merge suggestion not found' }, { status: 404 })
    }

    const body = await req.json() as Record<string, unknown>
    const keepId = body.keepId
    if (!isUuid(keepId)) {
      return NextResponse.json({ error: 'keepId is required' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: suggestion, error: suggestionError } = await supabase
      .from('customer_merge_suggestions')
      .select('id, organization_id, profile_a_id, profile_b_id, reason, confidence, status, created_at')
      .eq('id', params.id)
      .eq('organization_id', ORG_ID)
      .eq('status', 'pending')
      .maybeSingle<MergeSuggestionRow>()

    if (suggestionError) {
      console.error('Confirm merge suggestion fetch error:', suggestionError)
      return NextResponse.json({ error: 'Failed to fetch merge suggestion' }, { status: 500 })
    }

    if (!suggestion) {
      return NextResponse.json({ error: 'Merge suggestion not found' }, { status: 404 })
    }

    if (keepId !== suggestion.profile_a_id && keepId !== suggestion.profile_b_id) {
      return NextResponse.json({ error: 'keepId must be one of the suggested profiles' }, { status: 400 })
    }

    const sourceId = keepId === suggestion.profile_a_id ? suggestion.profile_b_id : suggestion.profile_a_id
    const { data: mergeId, error: mergeError } = await supabase.rpc('merge_customers', {
      p_organization_id: ORG_ID,
      p_source_id: sourceId,
      p_target_id: keepId,
      p_merged_by: 'staff',
    })

    if (mergeError) {
      console.error('Confirm merge RPC error:', mergeError)
      return NextResponse.json({ error: 'Failed to merge customers' }, { status: 500 })
    }

    const { error: updateError } = await supabase
      .from('customer_merge_suggestions')
      .update({
        status: 'confirmed',
        reviewed_by: 'staff',
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', suggestion.id)
      .eq('organization_id', ORG_ID)

    if (updateError) {
      console.error('Confirm merge suggestion status error:', updateError)
      return NextResponse.json({ error: 'Customers merged, but suggestion review status was not updated' }, { status: 500 })
    }

    return NextResponse.json({
      mergeId: typeof mergeId === 'string' ? mergeId : String(mergeId),
      survivingCustomerId: keepId,
    })
  } catch (err) {
    console.error('Confirm merge suggestion POST error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
