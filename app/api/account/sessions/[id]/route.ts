import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/getOrgId'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

function decodeSessionId(accessToken?: string | null) {
  if (!accessToken) return null

  const [, payload] = accessToken.split('.')
  if (!payload) return null

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = Buffer.from(normalized, 'base64').toString('utf8')
    const parsed = JSON.parse(json) as { session_id?: unknown }
    return typeof parsed.session_id === 'string' ? parsed.session_id : null
  } catch {
    return null
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await requireAuth()
    if (ctx instanceof NextResponse) return ctx

    const sessionClient = createSupabaseServerClient()
    const { data: { session } } = await sessionClient.auth.getSession()
    const currentSessionId = decodeSessionId(session?.access_token)

    if (!session?.access_token || params.id !== currentSessionId) {
      return NextResponse.json({ data: null, error: 'Session not found' }, { status: 404 })
    }

    const admin = createSupabaseAdminClient()
    const { error } = await admin.auth.admin.signOut(session.access_token, 'local')

    if (error) {
      console.error('Session DELETE error:', error)
      return NextResponse.json({ data: null, error: 'Failed to sign out session' }, { status: 500 })
    }

    return NextResponse.json({ data: { ok: true }, error: null })
  } catch (err) {
    console.error('Session DELETE error:', err)
    return NextResponse.json({ data: null, error: 'Internal error' }, { status: 500 })
  }
}
