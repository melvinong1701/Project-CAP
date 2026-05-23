import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/getOrgId'
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

interface ProfilePayload {
  fullName?: unknown
  displayName?: unknown
  email?: unknown
  avatarUrl?: unknown
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireAuth()
    if (ctx instanceof NextResponse) return ctx

    const payload = await request.json() as ProfilePayload
    const fullName = typeof payload.fullName === 'string' ? payload.fullName.trim() : ''
    const displayName = typeof payload.displayName === 'string' ? payload.displayName.trim() : ''
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
    const avatarUrl = typeof payload.avatarUrl === 'string' && payload.avatarUrl.trim()
      ? payload.avatarUrl.trim()
      : null

    if (!fullName) {
      return NextResponse.json({ data: null, error: 'Full name is required', field: 'fullName' }, { status: 400 })
    }

    if (!displayName) {
      return NextResponse.json({ data: null, error: 'Display name is required', field: 'displayName' }, { status: 400 })
    }

    if (!email || !email.includes('@')) {
      return NextResponse.json({ data: null, error: 'A valid email address is required', field: 'email' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(ctx.userId)
    const currentEmail = authData.user?.email?.toLowerCase() ?? ''
    const emailChanged = email !== currentEmail

    if (authError || !authData.user) {
      return NextResponse.json({ data: null, error: 'Authenticated user not found' }, { status: 404 })
    }

    if (emailChanged) {
      // Email re-verification is not wired yet; keep an explicit unverified marker for the future flow.
      const { error: updateAuthError } = await supabase.auth.admin.updateUserById(ctx.userId, { email })
      if (updateAuthError) {
        return NextResponse.json({ data: null, error: updateAuthError.message, field: 'email' }, { status: 400 })
      }
    }

    const { error } = await supabase
      .from('user_profiles')
      .update({
        full_name: fullName,
        display_name: displayName,
        email,
        avatar_url: avatarUrl,
        email_verified: emailChanged ? false : Boolean(authData.user.email_confirmed_at),
      })
      .eq('id', ctx.userId)
      .eq('organization_id', ctx.organizationId)

    if (error) {
      console.error('Profile PATCH error:', error)
      return NextResponse.json({ data: null, error: 'Failed to save profile' }, { status: 500 })
    }

    return NextResponse.json({ data: { ok: true }, error: null })
  } catch (err) {
    console.error('Account profile PATCH error:', err)
    return NextResponse.json({ data: null, error: 'Internal error' }, { status: 500 })
  }
}
