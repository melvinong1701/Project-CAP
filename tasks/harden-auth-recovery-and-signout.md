# Harden password recovery + signOut

Two related problems being fixed in one pass:

1. Reset email links sometimes fail with "invalid or expired" on fresh click — caused by PKCE `code_verifier` cookie missing when `exchangeCodeForSession` runs.
2. Signed-out users sometimes regain access without re-login — caused by abandoned recovery sessions and `signOut` not revoking the refresh token globally.

## Strategy

- Switch password recovery from PKCE `code` exchange to OTP `token_hash` verification. This eliminates the entire `code_verifier` dependency and works across browsers/devices. It requires updating the Supabase email template.
- Use `scope: 'global'` on every `signOut` call so the refresh token is invalidated on the Supabase side, not just the local cookie.
- On `/auth/reset-password` mount, sign out any pre-existing session before verifying the recovery token. This wipes stale recovery sessions left from earlier attempts.
- On `/auth/reset-password` unmount without form submission, sign out. This stops "I clicked the email then closed the tab and came back logged in" cases.

## Files to change

1. Supabase Dashboard → Authentication → Email Templates → "Reset Password"
2. `app/login/page.tsx`
3. `app/auth/reset-password/page.tsx`
4. `app/account/AccountPageClient.tsx`

---

## Step 1 — Supabase email template

Authentication → Email Templates → Reset Password. Replace the link in the template with this exact line:

```html
<a href="{{ .SiteURL }}/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery">Reset password</a>
```

Save. This makes Supabase embed a token hash directly in the URL — no PKCE verifier needed on click.

The Site URL should already be set to `https://project-cap.vercel.app`. For local dev, you can manually swap in `http://localhost:3000` when testing, or just test on production.

---

## Step 2 — `app/login/page.tsx`

In `handleForgotPassword` (line ~105), no code change is strictly required since `redirectTo` is now redundant when using `token_hash`, but leave it as a safety net. The current `redirectTo` is fine. Skip this file.

---

## Step 3 — `app/auth/reset-password/page.tsx`

Rewrite the `useEffect` to:

1. Sign out any pre-existing session immediately on mount (clears stale recovery sessions from prior attempts).
2. Read `token_hash` and `type` from URL params.
3. If both present, call `supabase.auth.verifyOtp({ token_hash, type: 'recovery' })`.
4. Fall back to existing `code` exchange path so users with in-flight old-format emails still work for the next hour.
5. On unmount without successful form submission, sign out globally.

Full replacement for the `useEffect` block and surrounding setup:

```tsx
const submittedRef = useRef(false)

useEffect(() => {
  if (exchangeStarted.current) return
  exchangeStarted.current = true

  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const code = searchParams.get('code')

  const prepareSession = async () => {
    // Wipe any pre-existing session — recovery should always start clean
    await supabase.auth.signOut({ scope: 'local' })

    // Preferred: OTP token_hash path (works without code_verifier cookie)
    if (tokenHash && type === 'recovery') {
      const { error: otpErr } = await supabase.auth.verifyOtp({
        type: 'recovery',
        token_hash: tokenHash,
      })
      if (otpErr) {
        setExchangeError('This password reset link is invalid or has expired.')
        setStatus('error')
        return
      }
      setStatus('ready')
      return
    }

    // Legacy fallback: PKCE code exchange
    if (code) {
      const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code)
      if (exchangeErr) {
        setExchangeError('This password reset link is invalid or has expired.')
        setStatus('error')
        return
      }
      setStatus('ready')
      return
    }

    setExchangeError('This password reset link is invalid or has expired.')
    setStatus('error')
  }

  void prepareSession()
}, [searchParams])

// Sign out on unmount if reset wasn't completed
useEffect(() => {
  return () => {
    if (!submittedRef.current) {
      void supabase.auth.signOut({ scope: 'global' })
    }
  }
}, [])
```

In `handleReset`, set `submittedRef.current = true` immediately after the `updateUser` success check, and change the existing `signOut()` to `signOut({ scope: 'global' })`:

```tsx
submittedRef.current = true
await supabase.auth.signOut({ scope: 'global' })
router.push('/login')
```

---

## Step 4 — `app/account/AccountPageClient.tsx`

Line 626 — change:

```ts
await supabase.auth.signOut()
```

to:

```ts
await supabase.auth.signOut({ scope: 'global' })
```

That's the only change in this file.

---

## Step 5 — Supabase Dashboard URL allowlist

No change needed. `/auth/reset-password` entries from previous step still apply.

---

## Verify

1. `npx tsc --noEmit && npm run lint && npm run build` — all pass.
2. Push. Wait for Vercel.
3. From `https://project-cap.vercel.app/login`, request a reset.
4. Inspect the email link source. It should contain `token_hash=...&type=recovery`, NOT `pkce_...`.
5. Click. You should land on `/auth/reset-password`, briefly see "Verifying", then the password form. No "invalid" error.
6. Submit new password. Redirected to `/login`. Sign in with new password — works.
7. **Sticky-session test:** request another reset email, click the link, land on reset page, then in the same tab navigate to `https://project-cap.vercel.app/`. You should be kicked to `/login`, NOT see the chat page. (Because step 3's mount-time signOut killed the prior session, and you haven't completed this one.)
8. **bfcache test:** sign in normally, sign out via the account page, then press the browser Back button. If you see the chat page, hit refresh. You should be redirected to `/login` on refresh — confirming bfcache was showing a stale render.

## Notes

- `scope: 'global'` invalidates the refresh token on Supabase's side, so any leftover cookie in any tab stops working after the current access token expires (max ~1 hour).
- The mount-time signOut on reset-password is the key fix for abandoned-recovery sessions.
- If you want to also kill bfcache for the chat page, that's a separate change (add a `Cache-Control: no-store` header in middleware for authenticated routes). Don't do it in this pass.
