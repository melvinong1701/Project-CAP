import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/getOrgId'
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

interface InvitePayload {
  email?: unknown
  role?: unknown
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireOwner()
    if (ctx instanceof NextResponse) return ctx

    const payload = await request.json() as InvitePayload
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
    const role = payload.role === 'agent' ? 'agent' : ''

    if (!email || !email.includes('@')) {
      return NextResponse.json({ data: null, error: 'A valid email is required', field: 'email' }, { status: 400 })
    }

    if (role !== 'agent') {
      return NextResponse.json({ data: null, error: 'Only agent invites are supported', field: 'role' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data: existingMembers, error: existingMemberError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .eq('email', email)
      .limit(1)
      .returns<{ id: string }[]>()

    if (existingMemberError) {
      console.error('Invite duplicate check error:', existingMemberError)
      return NextResponse.json({ data: null, error: 'Failed to check existing members' }, { status: 500 })
    }

    if ((existingMembers ?? []).length > 0) {
      return NextResponse.json({ data: null, error: 'This person is already a member.', field: 'email' }, { status: 400 })
    }

    const origin = request.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: origin ? `${origin}/auth/callback?next=/account` : undefined,
      data: { organization_id: ctx.organizationId, role },
    })

    if (error || !data.user) {
      return NextResponse.json({ data: null, error: error?.message ?? 'Failed to invite member' }, { status: 400 })
    }

    const fallbackName = email.split('@')[0] || 'Agent'
    const { error: profileError } = await supabase
      .from('user_profiles')
      .upsert({
        id: data.user.id,
        organization_id: ctx.organizationId,
        role,
        email,
        full_name: fallbackName,
        display_name: fallbackName,
      })

    if (profileError) {
      console.error('Invite profile error:', profileError)
      return NextResponse.json({ data: null, error: 'Invite sent, but member profile was not saved' }, { status: 500 })
    }

    return NextResponse.json({ data: { ok: true }, error: null })
  } catch (err) {
    console.error('Invite POST error:', err)
    return NextResponse.json({ data: null, error: 'Internal error' }, { status: 500 })
  }
}
