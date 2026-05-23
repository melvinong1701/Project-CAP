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

function deviceName(userAgent: string | null) {
  if (!userAgent) return 'Unknown device'
  if (userAgent.includes('iPhone')) return 'iPhone'
  if (userAgent.includes('iPad')) return 'iPad'
  if (userAgent.includes('Android')) return 'Android'
  if (userAgent.includes('Mac OS X')) return 'Mac'
  if (userAgent.includes('Windows')) return 'Windows'
  if (userAgent.includes('Linux')) return 'Linux'
  return 'Browser session'
}

async function currentSessionId() {
  const sessionClient = createSupabaseServerClient()
  const { data: { session } } = await sessionClient.auth.getSession()
  return {
    sessionId: decodeSessionId(session?.access_token),
    accessToken: session?.access_token ?? null,
  }
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth()
    if (ctx instanceof NextResponse) return ctx

    const { sessionId } = await currentSessionId()
    const userAgent = request.headers.get('user-agent')
    const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    const now = new Date().toISOString()

    return NextResponse.json({
      data: {
        sessions: sessionId
          ? [{
              id: sessionId,
              deviceName: deviceName(userAgent),
              location: forwardedFor,
              lastActiveAt: now,
              createdAt: now,
              expiresAt: null,
              current: true,
            }]
          : [],
      },
      error: null,
    })
  } catch (err) {
    console.error('Sessions GET error:', err)
    return NextResponse.json({ data: null, error: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const ctx = await requireAuth()
    if (ctx instanceof NextResponse) return ctx

    const { accessToken } = await currentSessionId()
    if (!accessToken) {
      return NextResponse.json({ data: null, error: 'Current session not found' }, { status: 400 })
    }

    const admin = createSupabaseAdminClient()
    const { error } = await admin.auth.admin.signOut(accessToken, 'others')

    if (error) {
      console.error('Sessions DELETE error:', error)
      return NextResponse.json({ data: null, error: 'Failed to sign out other sessions' }, { status: 500 })
    }

    return NextResponse.json({ data: { ok: true }, error: null })
  } catch (err) {
    console.error('Sessions DELETE error:', err)
    return NextResponse.json({ data: null, error: 'Internal error' }, { status: 500 })
  }
}
