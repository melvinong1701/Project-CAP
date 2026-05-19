import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { ConversationStatus } from '@/lib/types'

const ORG_ID = '00000000-0000-0000-0000-000000000001'
const STATUSES: ConversationStatus[] = ['open', 'pending', 'closed']

interface RouteContext {
  params: { id: string }
}

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel env vars')
  }
  return createClient(supabaseUrl, supabaseKey)
}

function isConversationStatus(value: unknown): value is ConversationStatus {
  return typeof value === 'string' && STATUSES.includes(value as ConversationStatus)
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const body = await req.json() as { status?: unknown }
    if (!isConversationStatus(body.status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 })
    }

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('conversations')
      .update({ status: body.status })
      .eq('id', params.id)
      .eq('organization_id', ORG_ID)
      .select('id')
      .maybeSingle<{ id: string }>()

    if (error) {
      console.error('Conversation status update error:', error)
      return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Conversation status PATCH error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
