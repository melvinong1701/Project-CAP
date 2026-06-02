import { type SupabaseClient } from '@supabase/supabase-js'

export const WHATSAPP_GRAPH_API_BASE_URL = 'https://graph.facebook.com'
export const WHATSAPP_GRAPH_API_VERSION = 'v21.0'

export interface SendWhatsAppResult {
  ok: boolean
  error?: string
}

interface ConversationRow {
  id: string
  external_id: string
  store_id: string | null
  channel: string
}

interface StorePlatformRow {
  wa_phone_number_id: string | null
  wa_access_token: string | null
}

interface WhatsAppGraphError {
  message?: string
  type?: string
  code?: number
}

interface WhatsAppSendResponse {
  messaging_product?: string
  contacts?: { input?: string; wa_id?: string }[]
  messages?: { id?: string }[]
  error?: WhatsAppGraphError
}

function getGraphError(data: WhatsAppSendResponse | null, fallback: string) {
  return data?.error?.message ?? fallback
}

export async function sendWhatsAppMessage(
  supabase: SupabaseClient,
  params: {
    conversationId: string
    organizationId: string
    text: string
  }
): Promise<SendWhatsAppResult> {
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('id, external_id, store_id, channel')
    .eq('id', params.conversationId)
    .eq('organization_id', params.organizationId)
    .single<ConversationRow>()

  if (convErr || !conv) {
    return { ok: false, error: 'Conversation not found' }
  }

  if (conv.channel !== 'whatsapp') {
    return { ok: false, error: 'Only whatsapp channel supported' }
  }

  if (!conv.store_id) {
    return { ok: false, error: 'Conversation has no store' }
  }

  const { data: platform } = await supabase
    .from('store_platforms')
    .select('wa_phone_number_id, wa_access_token')
    .eq('store_id', conv.store_id)
    .eq('organization_id', params.organizationId)
    .eq('platform_id', 'whatsapp')
    .single<StorePlatformRow>()

  if (!platform?.wa_phone_number_id || !platform.wa_access_token) {
    return { ok: false, error: 'No WhatsApp credentials configured for this store' }
  }

  let graphData: WhatsAppSendResponse | null = null
  const url = `${WHATSAPP_GRAPH_API_BASE_URL}/${WHATSAPP_GRAPH_API_VERSION}/${encodeURIComponent(platform.wa_phone_number_id)}/messages`

  try {
    const graphRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${platform.wa_access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: conv.external_id,
        type: 'text',
        text: { body: params.text },
      }),
    })

    graphData = await graphRes.json() as WhatsAppSendResponse

    if (!graphRes.ok || graphData.error) {
      return { ok: false, error: getGraphError(graphData, 'WhatsApp send failed') }
    }
  } catch {
    return { ok: false, error: 'WhatsApp send failed' }
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
