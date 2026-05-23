import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

interface OrgContext {
  userId: string
  organizationId: string
  role: 'owner' | 'agent'
  storedRole: string
}

export async function getOrgId(): Promise<OrgContext | null> {
  const supabase = createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) return null

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) return null

  return {
    userId: user.id,
    organizationId: profile.organization_id,
    role: profile.role === 'agent' ? 'agent' : 'owner',
    storedRole: profile.role,
  }
}

export async function requireAuth(): Promise<OrgContext | NextResponse> {
  const ctx = await getOrgId()
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return ctx
}

export async function requireOwner(): Promise<OrgContext | NextResponse> {
  const ctx = await requireAuth()
  if (ctx instanceof NextResponse) return ctx

  if (ctx.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return ctx
}
