import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/getOrgId'
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireOwner()
    if (ctx instanceof NextResponse) return ctx

    const payload = await request.json() as { userId?: unknown }
    const userId = typeof payload.userId === 'string' ? payload.userId : ''

    if (!userId || userId === ctx.userId) {
      return NextResponse.json({ data: null, error: 'Select another member' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data: target, error: targetError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('id', userId)
      .eq('organization_id', ctx.organizationId)
      .single<{ id: string }>()

    if (targetError || !target) {
      return NextResponse.json({ data: null, error: 'Member not found' }, { status: 404 })
    }

    // TODO: Move this ownership swap into a single RPC transaction before production org deletion/team workflows ship.
    const { error: targetUpdateError } = await supabase
      .from('user_profiles')
      .update({ role: 'owner' })
      .eq('id', userId)
      .eq('organization_id', ctx.organizationId)

    if (targetUpdateError) {
      console.error('Transfer target update error:', targetUpdateError)
      return NextResponse.json({ data: null, error: 'Failed to transfer ownership' }, { status: 500 })
    }

    const { error: currentUpdateError } = await supabase
      .from('user_profiles')
      .update({ role: 'admin' })
      .eq('id', ctx.userId)
      .eq('organization_id', ctx.organizationId)

    if (currentUpdateError) {
      console.error('Transfer current user update error:', currentUpdateError)
      return NextResponse.json({ data: null, error: 'Ownership changed, but current role update failed' }, { status: 500 })
    }

    return NextResponse.json({ data: { ok: true }, error: null })
  } catch (err) {
    console.error('Transfer ownership error:', err)
    return NextResponse.json({ data: null, error: 'Internal error' }, { status: 500 })
  }
}
