import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/getOrgId'
import { WHATSAPP_GRAPH_API_BASE_URL, WHATSAPP_GRAPH_API_VERSION } from '@/lib/sendWhatsAppMessage'

interface StoreRow {
  id: string
}

interface WhatsAppPhoneNumberResponse {
  id?: string
  display_phone_number?: string
  verified_name?: string
  error?: {
    message?: string
  }
}

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel env vars')
  }

  return createClient(supabaseUrl, supabaseKey)
}

function buildAccountLabel(phoneNumber: WhatsAppPhoneNumberResponse) {
  const verifiedName = phoneNumber.verified_name?.trim()
  const displayPhone = phoneNumber.display_phone_number?.trim()

  if (verifiedName && displayPhone) return `${verifiedName} (${displayPhone})`
  if (displayPhone) return displayPhone
  if (verifiedName) return verifiedName
  return `WhatsApp ${phoneNumber.id ?? 'number'}`
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    if (ctx instanceof NextResponse) return ctx
    const ORG_ID = ctx.organizationId

    const supabase = getSupabase()
    const { phoneNumberId, accessToken, storeId } = await req.json() as {
      phoneNumberId?: string
      accessToken?: string
      storeId?: string
    }

    const trimmedPhoneNumberId = phoneNumberId?.trim()
    const trimmedAccessToken = accessToken?.trim()
    const trimmedStoreId = storeId?.trim()

    if (!trimmedPhoneNumberId || !trimmedAccessToken || !trimmedStoreId) {
      return NextResponse.json(
        { error: 'phoneNumberId, accessToken, and storeId are required' },
        { status: 400 }
      )
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

    const phoneNumberUrl = `${WHATSAPP_GRAPH_API_BASE_URL}/${WHATSAPP_GRAPH_API_VERSION}/${encodeURIComponent(trimmedPhoneNumberId)}?fields=id,display_phone_number,verified_name`
    let phoneNumberData: WhatsAppPhoneNumberResponse

    try {
      const phoneNumberRes = await fetch(phoneNumberUrl, {
        headers: {
          Authorization: `Bearer ${trimmedAccessToken}`,
        },
      })

      phoneNumberData = await phoneNumberRes.json() as WhatsAppPhoneNumberResponse

      if (!phoneNumberRes.ok || phoneNumberData.error || phoneNumberData.id !== trimmedPhoneNumberId) {
        return NextResponse.json(
          { error: phoneNumberData.error?.message ?? 'Invalid WhatsApp credentials' },
          { status: 400 }
        )
      }
    } catch {
      return NextResponse.json(
        { error: 'Failed to validate WhatsApp credentials' },
        { status: 502 }
      )
    }

    const accountLabel = buildAccountLabel(phoneNumberData)
    const { error: dbErr } = await supabase
      .from('store_platforms')
      .upsert(
        {
          organization_id: ORG_ID,
          store_id: trimmedStoreId,
          platform_id: 'whatsapp',
          account_label: accountLabel,
          wa_phone_number_id: trimmedPhoneNumberId,
          wa_access_token: trimmedAccessToken,
        },
        { onConflict: 'store_id,platform_id' }
      )

    if (dbErr) {
      console.error('WhatsApp connection DB upsert error:', dbErr)
      return NextResponse.json({ error: 'Failed to save connection' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      phoneNumberId: trimmedPhoneNumberId,
      accountLabel,
      webhookRegistration: 'manual',
    })
  } catch (err) {
    console.error('WhatsApp connect error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
