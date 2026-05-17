import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel env vars')
  }
  // Use service role key server-side so we bypass RLS when inserting.
  return createClient(supabaseUrl, supabaseKey)
}

const ORG_ID = '00000000-0000-0000-0000-000000000001'

interface TelegramMessage {
  message_id: number
  from?: {
    id: number
    first_name?: string
    last_name?: string
    username?: string
  }
  chat: { id: number; type: string }
  date: number
  text?: string
  caption?: string
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
  channel_post?: TelegramMessage
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase()
    const update: TelegramUpdate = await req.json()
    const msg = update.message ?? update.edited_message

    // Only handle text messages for now
    if (!msg || (!msg.text && !msg.caption)) {
      return NextResponse.json({ ok: true })
    }

    const chatId = String(msg.chat.id)
    const text = msg.text ?? msg.caption ?? ''
    const senderName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || msg.from?.username || 'Unknown'
    const timestamp = new Date(msg.date * 1000).toISOString()

    // storeId is embedded in the webhook URL (set during /api/telegram/connect registration).
    // e.g. /api/telegram/webhook?storeId=<uuid>
    const { searchParams } = new URL(req.url)
    const storeId: string | null = searchParams.get('storeId')

    // Upsert conversation (unique on store_id + channel + external_id)
    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .upsert(
        {
          organization_id: ORG_ID,
          store_id: storeId,
          channel: 'telegram',
          external_id: chatId,
          sender_name: senderName,
          last_message: text,
          last_message_at: timestamp,
          is_read: false,
        },
        { onConflict: 'store_id,channel,external_id', ignoreDuplicates: false }
      )
      .select('id')
      .single()

    if (convErr || !conv) {
      console.error('Failed to upsert conversation:', convErr)
      return NextResponse.json({ ok: false }, { status: 500 })
    }

    // Update last_message + is_read on existing rows (upsert above handles insert, this covers update)
    await supabase
      .from('conversations')
      .update({ last_message: text, last_message_at: timestamp, is_read: false })
      .eq('id', conv.id)

    // Insert message
    const { error: msgErr } = await supabase.from('messages').insert({
      conversation_id: conv.id,
      organization_id: ORG_ID,
      sender: 'customer',
      content: text,
      timestamp,
    })

    if (msgErr) {
      console.error('Failed to insert message:', msgErr)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Webhook error:', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
