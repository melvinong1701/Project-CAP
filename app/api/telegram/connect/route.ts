import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
    const supabase = getSupabase()
    const { botToken, storeId } = await req.json() as { botToken: string; storeId: string }

    if (!botToken?.trim() || !storeId?.trim()) {
      return NextResponse.json({ error: 'botToken and storeId are required' }, { status: 400 })
    }

    // 1. Validate the token by calling getMe
    const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`)
    const meData = await meRes.json() as { ok: boolean; result?: { username?: string; first_name?: string }; description?: string }

    if (!meData.ok) {
      return NextResponse.json(
        { error: meData.description ?? 'Invalid bot token' },
        { status: 400 }
      )
    }

    const botUsername = meData.result?.username ?? meData.result?.first_name ?? 'bot'

    // 2. Determine the webhook URL from the request origin
    //    Embed storeId so the webhook handler knows which store each message belongs to.
    const origin = req.headers.get('origin') ?? req.headers.get('x-forwarded-host')
    const host = origin ?? process.env.VERCEL_URL ?? process.env.NEXT_PUBLIC_APP_URL
    const protocol = host?.startsWith('http') ? '' : 'https://'
    const webhookUrl = `${protocol}${host}/api/telegram/webhook?storeId=${encodeURIComponent(storeId)}`

    // 3. Register the webhook with Telegram
    const whRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
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
          store_id: storeId,
          platform_id: 'telegram',
          account_label: accountLabel,
          bot_token: botToken,
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
