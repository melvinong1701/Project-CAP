import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = [
  '/login',
  '/auth/callback',
  '/auth/reset-password',
  '/api/auth/signup',
  '/api/telegram/webhook',
  '/api/shopify/webhook',
  '/api/shopify/install',
  '/api/shopify/callback',
  '/api/shopify/reregister-webhooks',
]

export async function middleware(request: NextRequest) {
  const supabaseError = request.nextUrl.searchParams.get('error')
  const supabaseErrorCode = request.nextUrl.searchParams.get('error_code')
  const supabaseErrorDesc = request.nextUrl.searchParams.get('error_description')

  if (supabaseError && supabaseErrorCode && supabaseErrorDesc) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = `?error_code=${encodeURIComponent(supabaseErrorCode)}`
    return NextResponse.redirect(loginUrl)
  }

  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
