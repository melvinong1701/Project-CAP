import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/getOrgId'
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin'
import { normalizePreferences } from '@/lib/accountDefaults'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireAuth()
    if (ctx instanceof NextResponse) return ctx

    const payload = await request.json() as Record<string, unknown>
    const preferences = normalizePreferences(payload.preferences ?? payload)
    const supabase = createSupabaseAdminClient()

    const { error } = await supabase
      .from('user_profiles')
      .update({ preferences })
      .eq('id', ctx.userId)
      .eq('organization_id', ctx.organizationId)

    if (error) {
      console.error('Preferences PATCH error:', error)
      return NextResponse.json({ data: null, error: 'Failed to save preferences' }, { status: 500 })
    }

    return NextResponse.json({ data: { preferences }, error: null })
  } catch (err) {
    console.error('Preferences PATCH error:', err)
    return NextResponse.json({ data: null, error: 'Internal error' }, { status: 500 })
  }
}
