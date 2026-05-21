import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

interface OrgContext {
  userId: string
  organizationId: string
}

export async function getOrgId(): Promise<OrgContext | null> {
  const supabase = createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) return null

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) return null

  return { userId: user.id, organizationId: profile.organization_id }
}

export async function requireAuth(): Promise<OrgContext | NextResponse> {
  const ctx = await getOrgId()
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return ctx
}
