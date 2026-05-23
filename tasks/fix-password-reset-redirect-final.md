# Fix password reset redirect — definitive fix

## Root cause

The reset email's `redirect_to` is being silently rewritten by Supabase to the Site URL because the URL we pass (`${origin}/auth/callback?next=/auth/reset-password`) doesn't match the dashboard allowlist. Supabase allowlist uses exact matching by default — the `?next=...` query string kills the match for an entry like `http://localhost:3000/auth/callback`. Result: the email link redirects to `http://localhost:3000` (or `https://project-cap.vercel.app`) with the `code` param, but our app has no handler at `/` for that code, so the user lands on the dashboard or login page with no session and no error context.

Previous fixes patched the receiving side (`/auth/callback` route, reset-password page exchange, middleware error banner). None of them changed what Supabase actually puts in the email, which is where the real bug lives.

## Strategy

Eliminate the `/auth/callback` intermediary for the password reset flow. Send users directly to `/auth/reset-password`. That page does its own PKCE exchange against the `code` URL param. Fewer moving parts, no query string in redirectTo, allowlist match is unambiguous.

The existing `/auth/callback` route can stay for other flows (OAuth signup later), but the reset flow no longer touches it.

## Files to change

1. `app/login/page.tsx`
2. `app/auth/reset-password/page.tsx`

## Step 1 — `app/login/page.tsx` (line 105–107)

Change the `resetPasswordForEmail` call to redirect directly to `/auth/reset-password`:

```ts
const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
  redirectTo: `${window.location.origin}/auth/reset-password`,
})
```

That's the only change in this file. No query string. No `next=`.

## Step 2 — `app/auth/reset-password/page.tsx`

The current `useEffect` only calls `getSession()`, which fails because no session exists yet — the code in the URL hasn't been exchanged. Replace the effect to:

1. Read `code` from the URL
2. Call `supabase.auth.exchangeCodeForSession(code)`
3. On success → `setStatus('ready')`
4. On error or missing code → `setStatus('error')`

Use a `useRef` guard to prevent React strict-mode double-invoke from firing the exchange twice (PKCE codes are single-use).

```ts
import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ... inside component:
const searchParams = useSearchParams()
const exchangeStarted = useRef(false)

useEffect(() => {
  if (exchangeStarted.current) return
  exchangeStarted.current = true

  const code = searchParams.get('code')

  const prepareSession = async () => {
    if (!code) {
      // Maybe the user already has a recovery session (older flow). Check.
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        setStatus('ready')
        return
      }
      setExchangeError('This password reset link is invalid or has expired.')
      setStatus('error')
      return
    }

    const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code)
    if (exchangeErr) {
      setExchangeError('This password reset link is invalid or has expired.')
      setStatus('error')
      return
    }

    setStatus('ready')
  }

  void prepareSession()
}, [searchParams])
```

Because this page now reads `useSearchParams`, the **default export must be wrapped in `<Suspense>`** (same pattern as the login page fix). Rename `export default function ResetPasswordPage` → `function ResetPasswordPage` and add:

```tsx
import { Suspense } from 'react'

export default function ResetPasswordPageWrapper() {
  return (
    <Suspense>
      <ResetPasswordPage />
    </Suspense>
  )
}
```

Leave the form, validation, signOut on success, and redirect to `/login` untouched.

## Step 3 — Supabase dashboard

Authentication → URL Configuration → Redirect URLs. Final state should be exactly:

- `https://project-cap.vercel.app/auth/reset-password`
- `http://localhost:3000/auth/reset-password`
- `https://project-cap.vercel.app/auth/callback` (keep for future OAuth)
- `http://localhost:3000/auth/callback` (keep for future OAuth)

Remove anything else.

## Verify

1. `npx tsc --noEmit && npm run lint && npm run build` — all pass.
2. Push, wait for Vercel deploy.
3. From **production** (`https://project-cap.vercel.app/login`), click "Forgot password?", request a reset email.
4. Inspect the email link. The `redirect_to` query param **must** now read `https://project-cap.vercel.app/auth/reset-password`. If it still says `https://project-cap.vercel.app/` you have a Site URL fallback — re-check the allowlist entry exactly.
5. Click the link. You should land at `/auth/reset-password`, briefly see "Verifying reset link…", then the "Set a new password" form.
6. Submit a new password. Should sign out and redirect to `/login`.
7. Sign in with the new password — succeeds.

## Notes

- If you want to test on localhost, the dev server (`npm run dev`) must be running before you click the email link. The reason your last test "would not load" is almost certainly that localhost wasn't running — the email redirected to `http://localhost:3000` and your browser had nothing to talk to.
- The middleware error-forwarding for `otp_expired` (last commit) is still useful and stays.
