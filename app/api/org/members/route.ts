import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/getOrgId'
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

interface MemberRow {
  id: string
  email: string
  role: string
  full_name: string | null
  display_name: string | null
  avatar_url: string | null
  created_at: string
}

function normalizeRole(role: string) {
  return role === 'agent' ? 'agent' : 'owner'
}

export async function GET() {
  try {
    const ctx = await requireAuth()
    if (ctx instanceof NextResponse) return ctx

    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, email, role, full_name, display_name, avatar_url, created_at')
      .eq('organization_id', ctx.organizationId)
      .order('created_at')
      .returns<MemberRow[]>()

    if (error) {
      console.error('Members GET error:', error)
      return NextResponse.json({ data: null, error: 'Failed to fetch members' }, { status: 500 })
    }

    return NextResponse.json({
      data: {
        members: (data ?? []).map(member => {
          const fallbackName = member.email.split('@')[0] || 'User'
          return {
            id: member.id,
            email: member.email,
            role: normalizeRole(member.role),
            fullName: member.full_name ?? fallbackName,
            displayName: member.display_name ?? member.full_name ?? fallbackName,
            avatarUrl: member.avatar_url,
            joinedAt: member.created_at,
            isCurrentUser: member.id === ctx.userId,
          }
        }),
      },
      error: null,
    })
  } catch (err) {
    console.error('Members GET error:', err)
    return NextResponse.json({ data: null, error: 'Internal error' }, { status: 500 })
  }
}
