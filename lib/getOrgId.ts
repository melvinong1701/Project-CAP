import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

interface OrgContext {
  userId: string
  organizationId: string
  role: 'owner' | 'admin' | 'agent'
  storedRole: string
}

function normalizeRole(role: string): OrgContext['role'] {
  if (role === 'owner' || role === 'admin') return role
  return 'agent'
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
    role: normalizeRole(profile.role),
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

export async function requireAdmin(): Promise<OrgContext | NextResponse> {
  const ctx = await requireAuth()
  if (ctx instanceof NextResponse) return ctx

  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return ctx
}
