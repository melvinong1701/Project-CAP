import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/getOrgId'
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const ctx = await requireOwner()
    if (ctx instanceof NextResponse) return ctx

    if (params.userId === ctx.userId) {
      return NextResponse.json({ data: null, error: 'Owners cannot remove themselves' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data: member, error: memberError } = await supabase
      .from('user_profiles')
      .select('id, role')
      .eq('id', params.userId)
      .eq('organization_id', ctx.organizationId)
      .single<{ id: string; role: string }>()

    if (memberError || !member) {
      return NextResponse.json({ data: null, error: 'Member not found' }, { status: 404 })
    }

    if (member.role === 'owner') {
      return NextResponse.json({ data: null, error: 'Transfer ownership before removing the owner' }, { status: 400 })
    }

    const { error } = await supabase
      .from('user_profiles')
      .delete()
      .eq('id', params.userId)
      .eq('organization_id', ctx.organizationId)

    if (error) {
      console.error('Member DELETE profile error:', error)
      return NextResponse.json({ data: null, error: 'Failed to remove member' }, { status: 500 })
    }

    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(params.userId)
    if (deleteUserError) {
      console.error('Member DELETE auth user error:', deleteUserError.message)
    }

    return NextResponse.json({ data: { ok: true }, error: null })
  } catch (err) {
    console.error('Member DELETE error:', err)
    return NextResponse.json({ data: null, error: 'Internal error' }, { status: 500 })
  }
}
