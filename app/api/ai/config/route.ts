import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth, requireOwner } from '@/lib/getOrgId'

interface StoreAiConfigBody {
  storeId?: unknown
  storeName?: unknown
  tone?: unknown
  primaryLanguage?: unknown
  returnPolicy?: unknown
  shippingPolicy?: unknown
  customInstructions?: unknown
  customGuardrails?: unknown
  autoSendEnabled?: unknown
}

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel env vars')
  }
  return createClient(supabaseUrl, supabaseKey)
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

const requiredString = (value: unknown) => typeof value === 'string'

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    if (ctx instanceof NextResponse) return ctx
    const ORG_ID = ctx.organizationId

    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')

    if (!storeId) {
      return jsonError('storeId is required', 400)
    }

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('store_ai_config')
      .select('id, organization_id, store_id, store_name, tone, primary_language, return_policy, shipping_policy, custom_instructions, custom_guardrails, auto_send_enabled, created_at, updated_at')
      .eq('store_id', storeId)
      .eq('organization_id', ORG_ID)
      .maybeSingle()

    if (error) {
      console.error('Fetch store AI config error:', error)
      return jsonError('Failed to fetch store AI config', 500)
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Store AI config GET error:', err)
    return jsonError('Internal error', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireOwner()
    if (ctx instanceof NextResponse) return ctx
    if (ctx.storedRole !== 'owner') return jsonError('Forbidden', 403)
    const ORG_ID = ctx.organizationId

    const body = await req.json() as StoreAiConfigBody
    const {
      storeId,
      storeName,
      tone,
      primaryLanguage,
      returnPolicy,
      shippingPolicy,
      customInstructions,
    } = body

    if (
      !requiredString(storeId) ||
      !requiredString(storeName) ||
      !requiredString(tone) ||
      !requiredString(primaryLanguage) ||
      !requiredString(returnPolicy) ||
      !requiredString(shippingPolicy) ||
      !requiredString(customInstructions)
    ) {
      return jsonError('storeId, storeName, tone, primaryLanguage, returnPolicy, shippingPolicy, and customInstructions are required', 400)
    }

    const rawGuardrails = body.customGuardrails
    if (rawGuardrails !== undefined) {
      if (!Array.isArray(rawGuardrails) || (rawGuardrails as unknown[]).some(g => typeof g !== 'string')) {
        return jsonError('customGuardrails must be an array of strings', 400)
      }
    }
    const customGuardrails = rawGuardrails !== undefined
      ? (rawGuardrails as string[]).slice(0, 20)
      : []

    const supabase = getSupabase()
    const { error } = await supabase
      .from('store_ai_config')
      .upsert(
        {
          organization_id: ORG_ID,
          store_id: storeId,
          store_name: storeName,
          tone,
          primary_language: primaryLanguage,
          return_policy: returnPolicy,
          shipping_policy: shippingPolicy,
          custom_instructions: customInstructions,
          custom_guardrails: customGuardrails,
          auto_send_enabled: typeof body.autoSendEnabled === 'boolean' ? body.autoSendEnabled : false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'store_id' }
      )

    if (error) {
      console.error('Upsert store AI config error:', error)
      return jsonError('Failed to save store AI config', 500)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Store AI config POST error:', err)
    return jsonError('Internal error', 500)
  }
}
