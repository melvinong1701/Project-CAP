import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/getOrgId'
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin'
import { normalizeNotifications, normalizePreferences } from '@/lib/accountDefaults'

export const dynamic = 'force-dynamic'

interface ProfileRow {
  id: string
  organization_id: string
  role: string
  email: string
  full_name: string | null
  display_name: string | null
  avatar_url: string | null
  notification_preferences: unknown
  preferences: unknown
  email_verified: boolean | null
}

export async function GET() {
  try {
    const ctx = await requireAuth()
    if (ctx instanceof NextResponse) return ctx

    const supabase = createSupabaseAdminClient()
    const [{ data: profile, error: profileError }, authResult] = await Promise.all([
      supabase
        .from('user_profiles')
        .select('id, organization_id, role, email, full_name, display_name, avatar_url, notification_preferences, preferences, email_verified')
        .eq('id', ctx.userId)
        .eq('organization_id', ctx.organizationId)
        .single<ProfileRow>(),
      supabase.auth.admin.getUserById(ctx.userId),
    ])

    if (profileError || !profile) {
      return NextResponse.json({ data: null, error: 'Profile not found' }, { status: 404 })
    }

    const authUser = authResult.data.user
    const email = authUser?.email ?? profile.email
    const fallbackName = email.split('@')[0] || 'User'

    return NextResponse.json({
      data: {
        account: {
          id: profile.id,
          organizationId: profile.organization_id,
          role: ctx.role,
          storedRole: profile.role,
          email,
          fullName: profile.full_name ?? fallbackName,
          displayName: profile.display_name ?? profile.full_name ?? fallbackName,
          avatarUrl: profile.avatar_url,
          emailVerified: Boolean(profile.email_verified || authUser?.email_confirmed_at),
          notificationPreferences: normalizeNotifications(profile.notification_preferences),
          preferences: normalizePreferences(profile.preferences),
        },
      },
      error: null,
    })
  } catch (err) {
    console.error('Account GET error:', err)
    return NextResponse.json({ data: null, error: 'Internal error' }, { status: 500 })
  }
}
