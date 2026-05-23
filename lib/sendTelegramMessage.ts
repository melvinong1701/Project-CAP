import { type SupabaseClient } from '@supabase/supabase-js'

export interface SendTelegramResult {
  ok: boolean
  error?: string
}

interface TelegramSendResponse {
  ok: boolean
  description?: string
}

export async function sendTelegramMessage(
  supabase: SupabaseClient,
  params: {
    conversationId: string
    organizationId: string
    text: string
  }
): Promise<SendTelegramResult> {
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('id, external_id, store_id, channel')
    .eq('id', params.conversationId)
    .eq('organization_id', params.organizationId)
    .single()

  if (convErr || !conv) {
    return { ok: false, error: 'Conversation not found' }
  }

  if (conv.channel !== 'telegram') {
    return { ok: false, error: 'Only telegram channel supported' }
  }

  const { data: platform } = await supabase
    .from('store_platforms')
    .select('bot_token')
    .eq('store_id', conv.store_id)
    .eq('organization_id', params.organizationId)
    .eq('platform_id', 'telegram')
    .single()

  const botToken = platform?.bot_token ?? process.env.TELEGRAM_BOT_TOKEN

  if (!botToken) {
    return { ok: false, error: 'No Telegram bot token configured for this store' }
  }

  let tgData: TelegramSendResponse

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: conv.external_id, text: params.text }),
    })

    tgData = await tgRes.json() as TelegramSendResponse
  } catch {
    return { ok: false, error: 'Telegram send failed' }
  }

  if (!tgData.ok) {
    return { ok: false, error: tgData.description ?? 'Telegram send failed' }
  }

  const now = new Date().toISOString()
  const { error: messageErr } = await supabase.from('messages').insert({
    conversation_id: params.conversationId,
    organization_id: params.organizationId,
    sender: 'agent',
    content: params.text,
    timestamp: now,
  })

  if (messageErr) {
    return { ok: false, error: 'Failed to persist sent message' }
  }

  const { error: updateErr } = await supabase
    .from('conversations')
    .update({ last_message: params.text, last_message_at: now, is_read: true })
    .eq('id', params.conversationId)
    .eq('organization_id', params.organizationId)

  if (updateErr) {
    return { ok: false, error: 'Failed to update conversation after send' }
  }

  return { ok: true }
}
