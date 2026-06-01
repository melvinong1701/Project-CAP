import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth, requireOwner } from '@/lib/getOrgId'

type KnowledgeKind = 'policy' | 'faq'

interface KnowledgeBody {
  id?: unknown
  storeId?: unknown
  kind?: unknown
  title?: unknown
  body?: unknown
  tags?: unknown
  isActive?: unknown
}

interface KnowledgeFields {
  kind?: KnowledgeKind
  title?: string
  body?: string
  tags?: string[]
  is_active?: boolean
}

const knowledgeSelect = 'id, kind, title, body, tags, is_active, created_at, updated_at'

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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function parseKind(value: unknown): KnowledgeKind | null {
  if (value === 'policy' || value === 'faq') return value
  return null
}

function parseTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const title = value.trim()
  if (!title || title.length > 200) return null
  return title
}

function parseBody(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const body = value.trim()
  if (!body || body.length > 8000) return null
  return body
}

function parseTags(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some(tag => typeof tag !== 'string')) {
    return null
  }

  return (value as string[])
    .map(tag => tag.trim())
    .filter(Boolean)
    .slice(0, 20)
}

function validateFields(body: KnowledgeBody, requireCoreFields: boolean): KnowledgeFields | NextResponse {
  const fields: KnowledgeFields = {}

  if (requireCoreFields || body.kind !== undefined) {
    const kind = parseKind(body.kind)
    if (!kind) return jsonError('kind must be policy or faq', 400)
    fields.kind = kind
  }

  if (requireCoreFields || body.title !== undefined) {
    const title = parseTitle(body.title)
    if (!title) return jsonError('title is required and must be 200 characters or fewer', 400)
    fields.title = title
  }

  if (requireCoreFields || body.body !== undefined) {
    const knowledgeBody = parseBody(body.body)
    if (!knowledgeBody) return jsonError('body is required and must be 8000 characters or fewer', 400)
    fields.body = knowledgeBody
  }

  if (body.tags !== undefined) {
    const tags = parseTags(body.tags)
    if (!tags) return jsonError('tags must be an array of strings', 400)
    fields.tags = tags
  }

  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') return jsonError('isActive must be a boolean', 400)
    fields.is_active = body.isActive
  }

  return fields
}

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
      .from('store_knowledge')
      .select(knowledgeSelect)
      .eq('organization_id', ORG_ID)
      .eq('store_id', storeId)
      .order('kind', { ascending: true })
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Fetch store knowledge error:', error)
      return jsonError('Failed to fetch store knowledge', 500)
    }

    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    console.error('Store knowledge GET error:', err)
    return jsonError('Internal error', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireOwner()
    if (ctx instanceof NextResponse) return ctx
    if (ctx.storedRole !== 'owner') return jsonError('Forbidden', 403)
    const ORG_ID = ctx.organizationId

    const body = await req.json() as KnowledgeBody
    if (!isNonEmptyString(body.storeId)) {
      return jsonError('storeId is required', 400)
    }

    const fields = validateFields(body, true)
    if (fields instanceof NextResponse) return fields

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('store_knowledge')
      .insert({
        organization_id: ORG_ID,
        store_id: body.storeId,
        kind: fields.kind,
        title: fields.title,
        body: fields.body,
        tags: fields.tags ?? [],
        is_active: fields.is_active ?? true,
      })
      .select(knowledgeSelect)
      .single()

    if (error) {
      console.error('Create store knowledge error:', error)
      return jsonError('Failed to create store knowledge entry', 500)
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Store knowledge POST error:', err)
    return jsonError('Internal error', 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireOwner()
    if (ctx instanceof NextResponse) return ctx
    if (ctx.storedRole !== 'owner') return jsonError('Forbidden', 403)
    const ORG_ID = ctx.organizationId

    const body = await req.json() as KnowledgeBody
    if (!isNonEmptyString(body.id)) {
      return jsonError('id is required', 400)
    }

    const fields = validateFields(body, false)
    if (fields instanceof NextResponse) return fields

    if (Object.keys(fields).length === 0) {
      return jsonError('At least one field is required', 400)
    }

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('store_knowledge')
      .update(fields)
      .eq('id', body.id)
      .eq('organization_id', ORG_ID)
      .select(knowledgeSelect)
      .maybeSingle()

    if (error) {
      console.error('Update store knowledge error:', error)
      return jsonError('Failed to update store knowledge entry', 500)
    }

    if (!data) {
      return jsonError('Knowledge entry not found', 404)
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Store knowledge PATCH error:', err)
    return jsonError('Internal error', 500)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await requireOwner()
    if (ctx instanceof NextResponse) return ctx
    if (ctx.storedRole !== 'owner') return jsonError('Forbidden', 403)
    const ORG_ID = ctx.organizationId

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return jsonError('id is required', 400)
    }

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('store_knowledge')
      .delete()
      .eq('id', id)
      .eq('organization_id', ORG_ID)
      .select('id')
      .maybeSingle()

    if (error) {
      console.error('Delete store knowledge error:', error)
      return jsonError('Failed to delete store knowledge entry', 500)
    }

    if (!data) {
      return jsonError('Knowledge entry not found', 404)
    }

    return NextResponse.json({ data: { ok: true } })
  } catch (err) {
    console.error('Store knowledge DELETE error:', err)
    return jsonError('Internal error', 500)
  }
}
