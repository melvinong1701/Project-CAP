import { NextRequest, NextResponse } from 'next/server'
import {
  ORG_ID,
  customerSelect,
  getSupabaseAdmin,
  mapCustomerSummary,
  type CustomerRow,
  type MergeSuggestionRow,
} from '../_utils'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const page = Math.max(Number(searchParams.get('page') ?? '1') || 1, 1)
    const perPage = Math.min(Math.max(Number(searchParams.get('per_page') ?? '20') || 20, 1), 100)
    const from = (page - 1) * perPage
    const to = from + perPage - 1
    const supabase = getSupabaseAdmin()

    const { data: suggestions, error, count } = await supabase
      .from('customer_merge_suggestions')
      .select('id, organization_id, profile_a_id, profile_b_id, reason, confidence, status, created_at', { count: 'exact' })
      .eq('organization_id', ORG_ID)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .range(from, to)
      .returns<MergeSuggestionRow[]>()

    if (error) {
      console.error('Merge suggestions fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch merge suggestions' }, { status: 500 })
    }

    const profileIds = Array.from(new Set((suggestions ?? []).flatMap(suggestion => [suggestion.profile_a_id, suggestion.profile_b_id])))
    const { data: profiles, error: profilesError } = profileIds.length
      ? await supabase
          .from('customers')
          .select(customerSelect)
          .eq('organization_id', ORG_ID)
          .neq('merge_status', 'merged_into')
          .in('id', profileIds)
          .returns<CustomerRow[]>()
      : { data: [] as CustomerRow[], error: null }

    if (profilesError) {
      console.error('Merge suggestion profiles fetch error:', profilesError)
      return NextResponse.json({ error: 'Failed to fetch merge suggestion profiles' }, { status: 500 })
    }

    const profilesById = new Map((profiles ?? []).map(profile => [profile.id, profile]))

    return NextResponse.json({
      data: (suggestions ?? []).map(suggestion => ({
        id: suggestion.id,
        profileA: profilesById.has(suggestion.profile_a_id)
          ? mapCustomerSummary(profilesById.get(suggestion.profile_a_id)!)
          : null,
        profileB: profilesById.has(suggestion.profile_b_id)
          ? mapCustomerSummary(profilesById.get(suggestion.profile_b_id)!)
          : null,
        reason: suggestion.reason,
        confidence: suggestion.confidence,
        createdAt: suggestion.created_at,
      })),
      total: count ?? 0,
      page,
      perPage,
    })
  } catch (err) {
    console.error('Merge suggestions GET error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
