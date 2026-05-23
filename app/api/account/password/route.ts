import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/getOrgId'
import { createSupabaseAdminClient, createSupabasePasswordClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

interface PasswordPayload {
  currentPassword?: unknown
  newPassword?: unknown
  confirmPassword?: unknown
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireAuth()
    if (ctx instanceof NextResponse) return ctx

    const payload = await request.json() as PasswordPayload
    const currentPassword = typeof payload.currentPassword === 'string' ? payload.currentPassword : ''
    const newPassword = typeof payload.newPassword === 'string' ? payload.newPassword : ''
    const confirmPassword = typeof payload.confirmPassword === 'string' ? payload.confirmPassword : ''

    if (!currentPassword) {
      return NextResponse.json({ data: null, error: 'Current password is required', field: 'currentPassword' }, { status: 400 })
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ data: null, error: 'New password must be at least 8 characters', field: 'newPassword' }, { status: 400 })
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json({ data: null, error: 'Passwords do not match', field: 'confirmPassword' }, { status: 400 })
    }

    const admin = createSupabaseAdminClient()
    const { data: authData, error: userError } = await admin.auth.admin.getUserById(ctx.userId)

    if (userError || !authData.user?.email) {
      return NextResponse.json({ data: null, error: 'Authenticated user not found' }, { status: 404 })
    }

    const verifier = createSupabasePasswordClient()
    const { error: verifyError } = await verifier.auth.signInWithPassword({
      email: authData.user.email,
      password: currentPassword,
    })

    if (verifyError) {
      return NextResponse.json({ data: null, error: 'Current password is incorrect', field: 'currentPassword' }, { status: 400 })
    }

    const { error } = await admin.auth.admin.updateUserById(ctx.userId, { password: newPassword })

    if (error) {
      return NextResponse.json({ data: null, error: error.message, field: 'newPassword' }, { status: 400 })
    }

    return NextResponse.json({ data: { ok: true }, error: null })
  } catch (err) {
    console.error('Password PATCH error:', err)
    return NextResponse.json({ data: null, error: 'Internal error' }, { status: 500 })
  }
}
