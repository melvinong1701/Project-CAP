import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel env vars')
  }
  return createClient(supabaseUrl, supabaseKey)
}

const ORG_ID = '00000000-0000-0000-0000-000000000001'

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase()
    const { conversationId, text } = await req.json() as { conversationId: string; text: string }

    if (!conversationId || !text?.trim()) {
      return NextResponse.json({ error: 'conversationId and text are required' }, { status: 400 })
    }

    // Fetch the conversation to get store_id + external_id (telegram chat_id)
    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .select('id, external_id, store_id, channel')
      .eq('id', conversationId)
      .single()

    if (convErr || !conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    if (conv.channel !== 'telegram') {
      return NextResponse.json({ error: 'Only telegram channel supported' }, { status: 400 })
    }

    // Look up the bot token for this store
    const { data: platform } = await supabase
      .from('store_platforms')
      .select('bot_token')
      .eq('store_id', conv.store_id)
      .eq('platform_id', 'telegram')
      .single()

    const botToken = platform?.bot_token ?? process.env.TELEGRAM_BOT_TOKEN

    if (!botToken) {
      return NextResponse.json({ error: 'No Telegram bot token configured for this store' }, { status: 500 })
    }

    // Send via Telegram Bot API
    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: conv.external_id, text }),
    })

    const tgData = await tgRes.json() as { ok: boolean; description?: string }
    if (!tgData.ok) {
      console.error('Telegram sendMessage failed:', tgData.description)
      return NextResponse.json({ error: tgData.description }, { status: 502 })
    }

    // Persist the agent's reply message
    const now = new Date().toISOString()
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      organization_id: ORG_ID,
      sender: 'agent',
      content: text,
      timestamp: now,
    })

    // Mark conversation as read + update last_message
    await supabase
      .from('conversations')
      .update({ last_message: text, last_message_at: now, is_read: true })
      .eq('id', conversationId)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Send error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
