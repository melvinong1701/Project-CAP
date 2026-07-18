import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireAuth, requireOwner } from '@/lib/getOrgId'
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin'
import { isLanguageValue, planConfig } from '@/lib/accountDefaults'

export const dynamic = 'force-dynamic'

interface OrganizationRow {
  id: string
  name: string
  logo_url: string | null
  default_language: string
  default_timezone: string
  plan: string
  ai_conversation_count: number
}

interface OrgPayload {
  name?: unknown
  logoUrl?: unknown
  defaultLanguage?: unknown
  defaultTimezone?: unknown
}

export async function GET() {
  try {
    const ctx = await requireAuth()
    if (ctx instanceof NextResponse) return ctx

    const supabase = createSupabaseAdminClient()
    const [{ data: org, error }, storeCountResult] = await Promise.all([
      supabase
        .from('organizations')
        .select('id, name, logo_url, default_language, default_timezone, plan, ai_conversation_count')
        .eq('id', ctx.organizationId)
        .single<OrganizationRow>(),
      supabase
        .from('store_platforms')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', ctx.organizationId),
    ])

    if (error || !org) {
      return NextResponse.json({ data: null, error: 'Organization not found' }, { status: 404 })
    }

    const plan = planConfig[org.plan] ?? planConfig.starter

    return NextResponse.json({
      data: {
        organization: {
          id: org.id,
          name: org.name,
          logoUrl: org.logo_url,
          defaultLanguage: org.default_language,
          defaultTimezone: org.default_timezone,
          plan: org.plan,
          planName: plan.name,
          planTier: plan.tier,
          storeLimit: plan.storeLimit,
          storesUsed: storeCountResult.count ?? 0,
          aiConversationCount: org.ai_conversation_count,
          aiConversationPool: plan.aiConversationPool,
        },
      },
      error: null,
    })
  } catch (err) {
    console.error('Org GET error:', err)
    return NextResponse.json({ data: null, error: 'Internal error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireAdmin()
    if (ctx instanceof NextResponse) return ctx

    const payload = await request.json() as OrgPayload
    const name = typeof payload.name === 'string' ? payload.name.trim() : ''
    const logoUrl = typeof payload.logoUrl === 'string' && payload.logoUrl.trim()
      ? payload.logoUrl.trim()
      : null
    const defaultLanguage = isLanguageValue(payload.defaultLanguage) ? payload.defaultLanguage : ''
    const defaultTimezone = typeof payload.defaultTimezone === 'string' ? payload.defaultTimezone.trim() : ''

    if (!name) {
      return NextResponse.json({ data: null, error: 'Organization name is required', field: 'name' }, { status: 400 })
    }

    if (!defaultLanguage) {
      return NextResponse.json({ data: null, error: 'Default language is required', field: 'defaultLanguage' }, { status: 400 })
    }

    if (!defaultTimezone) {
      return NextResponse.json({ data: null, error: 'Default timezone is required', field: 'defaultTimezone' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { error } = await supabase
      .from('organizations')
      .update({
        name,
        logo_url: logoUrl,
        default_language: defaultLanguage,
        default_timezone: defaultTimezone,
      })
      .eq('id', ctx.organizationId)

    if (error) {
      console.error('Org PATCH error:', error)
      return NextResponse.json({ data: null, error: 'Failed to save organization' }, { status: 500 })
    }

    return NextResponse.json({ data: { ok: true }, error: null })
  } catch (err) {
    console.error('Org PATCH error:', err)
    return NextResponse.json({ data: null, error: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await requireOwner()
    if (ctx instanceof NextResponse) return ctx

    const payload = await request.json().catch(() => ({})) as { confirmName?: unknown }
    const confirmName = typeof payload.confirmName === 'string' ? payload.confirmName.trim() : ''
    const supabase = createSupabaseAdminClient()

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', ctx.organizationId)
      .single<{ id: string; name: string }>()

    if (orgError || !org) {
      return NextResponse.json({ data: null, error: 'Organization not found' }, { status: 404 })
    }

    if (confirmName !== org.name) {
      return NextResponse.json({ data: null, error: 'Organization name confirmation does not match', field: 'confirmName' }, { status: 400 })
    }

    const { data: members, error: membersError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .returns<{ id: string }[]>()

    if (membersError) {
      return NextResponse.json({ data: null, error: 'Failed to load organization members' }, { status: 500 })
    }

    const tables = [
      'customer_orders',
      'customer_merges',
      'customer_merge_suggestions',
      'store_product_sync_state',
      'store_products',
      'messages',
      'conversations',
      'store_ai_config',
      'store_platforms',
      'customers',
      'stores',
      'user_profiles',
    ]

    for (const table of tables) {
      const { error } = await supabase.from(table).delete().eq('organization_id', ctx.organizationId)
      if (error) {
        console.error(`Delete org ${table} error:`, error)
        return NextResponse.json({ data: null, error: 'Failed to delete organization data' }, { status: 500 })
      }
    }

    const { error: deleteOrgError } = await supabase
      .from('organizations')
      .delete()
      .eq('id', ctx.organizationId)

    if (deleteOrgError) {
      console.error('Delete org row error:', deleteOrgError)
      return NextResponse.json({ data: null, error: 'Failed to delete organization' }, { status: 500 })
    }

    for (const member of members ?? []) {
      const { error } = await supabase.auth.admin.deleteUser(member.id)
      if (error) {
        console.error('Delete org auth user error:', { userId: member.id, message: error.message })
      }
    }

    return NextResponse.json({ data: { ok: true }, error: null })
  } catch (err) {
    console.error('Org DELETE error:', err)
    return NextResponse.json({ data: null, error: 'Internal error' }, { status: 500 })
  }
}
