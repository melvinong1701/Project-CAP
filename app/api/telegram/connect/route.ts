import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { encryptSecret } from '@/lib/credentialCrypto'
import { requireAuth } from '@/lib/getOrgId'

interface StoreRow {
  id: string
}

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel env vars')
  }
  return createClient(supabaseUrl, supabaseKey)
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    if (ctx instanceof NextResponse) return ctx
    const ORG_ID = ctx.organizationId

    const supabase = getSupabase()
    const { botToken, storeId } = await req.json() as { botToken: string; storeId: string }
    const trimmedBotToken = botToken?.trim()
    const trimmedStoreId = storeId?.trim()

    if (!trimmedBotToken || !trimmedStoreId) {
      return NextResponse.json({ error: 'botToken and storeId are required' }, { status: 400 })
    }

    const { data: store, error: storeErr } = await supabase
      .from('stores')
      .select('id')
      .eq('id', trimmedStoreId)
      .eq('organization_id', ORG_ID)
      .single<StoreRow>()

    if (storeErr || !store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    }

    // 1. Validate the token by calling getMe
    const meRes = await fetch(`https://api.telegram.org/bot${trimmedBotToken}/getMe`)
    const meData = await meRes.json() as { ok: boolean; result?: { username?: string; first_name?: string }; description?: string }

    if (!meData.ok) {
      return NextResponse.json(
        { error: meData.description ?? 'Invalid bot token' },
        { status: 400 }
      )
    }

    const botUsername = meData.result?.username ?? meData.result?.first_name ?? 'bot'
    const encryptedBotToken = encryptSecret(trimmedBotToken)

    // 2. Determine the webhook URL from the request origin
    //    Embed storeId so the webhook handler knows which store each message belongs to.
    const origin = req.headers.get('origin') ?? req.headers.get('x-forwarded-host')
    const host = origin ?? process.env.VERCEL_URL ?? process.env.NEXT_PUBLIC_APP_URL
    const protocol = host?.startsWith('http') ? '' : 'https://'
    const webhookUrl = `${protocol}${host}/api/telegram/webhook?storeId=${encodeURIComponent(trimmedStoreId)}`

    // 3. Register the webhook with Telegram
    const whRes = await fetch(`https://api.telegram.org/bot${trimmedBotToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message', 'edited_message'],
        drop_pending_updates: true,
      }),
    })

    const whData = await whRes.json() as { ok: boolean; description?: string }
    if (!whData.ok) {
      return NextResponse.json(
        { error: `Failed to set webhook: ${whData.description}` },
        { status: 400 }
      )
    }

    // 4. Upsert into store_platforms
    const accountLabel = `@${botUsername}`
    const { error: dbErr } = await supabase
      .from('store_platforms')
      .upsert(
        {
          organization_id: ORG_ID,
          store_id: trimmedStoreId,
          platform_id: 'telegram',
          account_label: accountLabel,
          bot_token: encryptedBotToken,
        },
        { onConflict: 'store_id,platform_id' }
      )

    if (dbErr) {
      console.error('DB upsert error:', dbErr)
      return NextResponse.json({ error: 'Failed to save connection' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      botUsername,
      accountLabel,
      webhookUrl,
    })
  } catch (err) {
    console.error('Connect error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
