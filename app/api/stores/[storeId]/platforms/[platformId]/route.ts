import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/getOrgId'

interface StorePlatformDisconnectRow {
  id: string
  bot_token: string | null
  platform_id: string
}

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured')
  }

  return createClient(supabaseUrl, supabaseKey)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { storeId: string; platformId: string } }
) {
  try {
    const ctx = await requireAuth()
    if (ctx instanceof NextResponse) return ctx
    const ORG_ID = ctx.organizationId

    const { storeId, platformId } = params
    const supabase = getSupabase()

    const { data: platform, error: fetchErr } = await supabase
      .from('store_platforms')
      .select('id, bot_token, platform_id')
      .eq('store_id', storeId)
      .eq('platform_id', platformId)
      .eq('organization_id', ORG_ID)
      .single<StorePlatformDisconnectRow>()

    if (fetchErr || !platform) {
      return NextResponse.json({ error: 'Platform connection not found' }, { status: 404 })
    }

    if (platformId === 'telegram' && platform.bot_token) {
      try {
        await fetch(`https://api.telegram.org/bot${platform.bot_token}/deleteWebhook`, {
          method: 'POST',
        })
      } catch (err) {
        console.error('Telegram deleteWebhook failed (non-blocking):', err)
      }
    }

    const { error: deleteErr } = await supabase
      .from('store_platforms')
      .delete()
      .eq('id', platform.id)
      .eq('organization_id', ORG_ID)

    if (deleteErr) {
      console.error('Delete platform error:', deleteErr)
      return NextResponse.json({ error: 'Failed to disconnect platform' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Disconnect error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
