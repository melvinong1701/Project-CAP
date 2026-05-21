import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase admin credentials are not configured.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

type SignupPayload = {
  email?: unknown
  password?: unknown
  orgName?: unknown
}

export async function POST(request: NextRequest) {
  let payload: SignupPayload

  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid signup request.' }, { status: 400 })
  }

  const email = typeof payload.email === 'string' ? payload.email.trim() : ''
  const password = typeof payload.password === 'string' ? payload.password : ''
  const orgName = typeof payload.orgName === 'string' ? payload.orgName.trim() : ''

  if (!email || !password || !orgName) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>

  try {
    supabase = getSupabaseAdmin()
  } catch {
    return NextResponse.json({ error: 'Signup is not configured.' }, { status: 500 })
  }

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    return NextResponse.json(
      { error: authError?.message ?? 'Signup failed.' },
      { status: 400 }
    )
  }

  const userId = authData.user.id

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({ name: orgName })
    .select('id')
    .single()

  if (orgError || !org) {
    await supabase.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: 'Failed to create organization.' }, { status: 500 })
  }

  const { error: profileError } = await supabase
    .from('user_profiles')
    .insert({ id: userId, organization_id: org.id, role: 'admin', email })

  if (profileError) {
    await supabase.from('organizations').delete().eq('id', org.id)
    await supabase.auth.admin.deleteUser(userId)
    return NextResponse.json(
      { error: 'Failed to link user to organization.' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    requiresConfirmation: authData.user.confirmed_at === null,
  })
}
