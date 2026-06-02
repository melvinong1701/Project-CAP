import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth, requireOwner } from '@/lib/getOrgId'
import { generateKnowledgeTags } from '@/lib/generateKnowledgeTags'
import { checkKnowledgeConflict, type KnowledgeConflictResult } from '@/lib/knowledgeConflictCheck'

type KnowledgeKind = 'policy' | 'faq'

interface KnowledgeBody {
  id?: unknown
  storeId?: unknown
  kind?: unknown
  title?: unknown
  body?: unknown
  tags?: unknown
  isActive?: unknown
  acknowledgeConflict?: unknown
}

interface KnowledgeFields {
  kind?: KnowledgeKind
  title?: string
  body?: string
  tags?: string[]
  is_active?: boolean
}

interface KnowledgeConflictRow {
  id: string
  kind: KnowledgeKind
  title: string
  body: string
  is_active: boolean
}

interface CurrentKnowledgeRow {
  id: string
  store_id: string
  kind: KnowledgeKind
  title: string
  body: string
  is_active: boolean
}

const knowledgeSelect = 'id, kind, title, body, tags, is_active, created_at, updated_at'
const policyTitleDuplicateMessage = 'A policy with this title already exists for this store. Edit the existing one instead.'

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

function jsonConflict(conflict: Extract<KnowledgeConflictResult, { conflict: true }>) {
  return NextResponse.json({
    error: conflict.explanation,
    conflict: {
      conflictsWithId: conflict.conflictsWithId,
      explanation: conflict.explanation,
    },
  }, { status: 409 })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPolicyTitleUniqueViolation(error: unknown) {
  if (!isRecord(error)) return false

  const code = typeof error.code === 'string' ? error.code : ''
  const detail = typeof error.details === 'string' ? error.details : ''
  const message = typeof error.message === 'string' ? error.message : ''

  return code === '23505' || `${detail} ${message}`.includes('store_knowledge_policy_title_uq')
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

function normalizePolicyTitle(title: string) {
  return title.trim().toLowerCase()
}

function hasPolicyTitleCollision(policies: KnowledgeConflictRow[], title: string) {
  const normalizedTitle = normalizePolicyTitle(title)
  return policies.some(policy => normalizePolicyTitle(policy.title) === normalizedTitle)
}

function activeConflictEntries(entries: KnowledgeConflictRow[]) {
  return entries
    .filter(entry => entry.is_active)
    .map(entry => ({
      id: entry.id,
      kind: entry.kind,
      title: entry.title,
      body: entry.body,
    }))
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

    const requestBody = await req.json() as KnowledgeBody
    if (!isNonEmptyString(requestBody.storeId)) {
      return jsonError('storeId is required', 400)
    }

    const fields = validateFields(requestBody, true)
    if (fields instanceof NextResponse) return fields
    if (!fields.kind || !fields.title || !fields.body) return jsonError('Invalid knowledge entry', 400)

    const supabase = getSupabase()
    const { data: entriesData, error: entriesError } = await supabase
      .from('store_knowledge')
      .select('id, kind, title, body, is_active')
      .eq('organization_id', ORG_ID)
      .eq('store_id', requestBody.storeId)

    if (entriesError) {
      console.error('Fetch store knowledge entries error:', entriesError)
      return jsonError('Failed to validate knowledge entry', 500)
    }

    const entries = (entriesData ?? []) as KnowledgeConflictRow[]
    if (fields.kind === 'policy') {
      const policies = entries.filter(entry => entry.kind === 'policy')
      if (hasPolicyTitleCollision(policies, fields.title)) {
        return jsonError(policyTitleDuplicateMessage, 409)
      }
    }

    if (requestBody.acknowledgeConflict !== true) {
      const conflict = await checkKnowledgeConflict({
        candidate: { title: fields.title, body: fields.body },
        existing: activeConflictEntries(entries),
      })

      if (conflict.conflict) {
        return jsonConflict(conflict)
      }
    }

    const tags = fields.tags && fields.tags.length > 0
      ? fields.tags
      : await generateKnowledgeTags({
        kind: fields.kind,
        title: fields.title,
        body: fields.body,
      })

    const { data, error } = await supabase
      .from('store_knowledge')
      .insert({
        organization_id: ORG_ID,
        store_id: requestBody.storeId,
        kind: fields.kind,
        title: fields.title,
        body: fields.body,
        tags,
        is_active: fields.is_active ?? true,
      })
      .select(knowledgeSelect)
      .single()

    if (error) {
      console.error('Create store knowledge error:', error)
      if (isPolicyTitleUniqueViolation(error)) {
        return jsonError(policyTitleDuplicateMessage, 409)
      }
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

    const requestBody = await req.json() as KnowledgeBody
    if (!isNonEmptyString(requestBody.id)) {
      return jsonError('id is required', 400)
    }

    const fields = validateFields(requestBody, false)
    if (fields instanceof NextResponse) return fields

    if (Object.keys(fields).length === 0) {
      return jsonError('At least one field is required', 400)
    }

    const supabase = getSupabase()
    const { data: currentData, error: currentError } = await supabase
      .from('store_knowledge')
      .select('id, store_id, kind, title, body, is_active')
      .eq('id', requestBody.id)
      .eq('organization_id', ORG_ID)
      .maybeSingle()

    if (currentError) {
      console.error('Fetch store knowledge entry error:', currentError)
      return jsonError('Failed to update store knowledge entry', 500)
    }

    if (!currentData) {
      return jsonError('Knowledge entry not found', 404)
    }

    const current = currentData as CurrentKnowledgeRow
    const nextKind = fields.kind ?? current.kind
    const nextTitle = fields.title ?? current.title
    const nextBody = fields.body ?? current.body

    const { data: entriesData, error: entriesError } = await supabase
      .from('store_knowledge')
      .select('id, kind, title, body, is_active')
      .eq('organization_id', ORG_ID)
      .eq('store_id', current.store_id)
      .neq('id', requestBody.id)

    if (entriesError) {
      console.error('Fetch store knowledge entries error:', entriesError)
      return jsonError('Failed to validate knowledge entry', 500)
    }

    const entries = (entriesData ?? []) as KnowledgeConflictRow[]
    if (nextKind === 'policy') {
      const policies = entries.filter(entry => entry.kind === 'policy')
      if (hasPolicyTitleCollision(policies, nextTitle)) {
        return jsonError(policyTitleDuplicateMessage, 409)
      }
    }

    if (requestBody.acknowledgeConflict !== true && (fields.title !== undefined || fields.body !== undefined)) {
      const conflict = await checkKnowledgeConflict({
        candidate: { title: nextTitle, body: nextBody },
        existing: activeConflictEntries(entries),
      })

      if (conflict.conflict) {
        return jsonConflict(conflict)
      }
    }

    const { data, error } = await supabase
      .from('store_knowledge')
      .update(fields)
      .eq('id', requestBody.id)
      .eq('organization_id', ORG_ID)
      .select(knowledgeSelect)
      .maybeSingle()

    if (error) {
      console.error('Update store knowledge error:', error)
      if (isPolicyTitleUniqueViolation(error)) {
        return jsonError(policyTitleDuplicateMessage, 409)
      }
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
