import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/getOrgId'
import { sendWhatsAppMessage } from '@/lib/sendWhatsAppMessage'

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel env vars')
  }
  return createClient(supabaseUrl, supabaseKey)
}

function statusForSendError(error?: string) {
  if (error === 'Conversation not found') return 404
  if (error === 'Only whatsapp channel supported') return 400
  if (error === 'Conversation has no store') return 400
  if (error === 'No WhatsApp credentials configured for this store') return 500
  return 502
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    if (ctx instanceof NextResponse) return ctx
    const ORG_ID = ctx.organizationId

    const supabase = getSupabase()
    const { conversationId, text } = await req.json() as {
      conversationId?: string
      text?: string
    }

    if (!conversationId || !text?.trim()) {
      return NextResponse.json({ error: 'conversationId and text are required' }, { status: 400 })
    }

    const result = await sendWhatsAppMessage(supabase, {
      conversationId,
      organizationId: ORG_ID,
      text,
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: statusForSendError(result.error) }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('WhatsApp send error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
