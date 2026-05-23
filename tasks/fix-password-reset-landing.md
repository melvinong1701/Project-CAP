# Fix: Reset password email lands on dashboard instead of reset-password page

## Root cause (diagnosed, not guesswork)

The reset email contains this link:
```
https://eoyolzalpwjakjdgdgck.supabase.co/auth/v1/verify?token=pkce_...&type=recovery&redirect_to=https://project-cap.vercel.app/
```

`redirect_to` is the Supabase project's Site URL (`/`), not `/auth/reset-password`. Supabase falls back to the Site URL when the `redirectTo` passed to `resetPasswordForEmail` is not in the allowed redirect URL list in the Supabase dashboard. The PKCE code lands on `/` where nothing exchanges it, the user's existing session is still active, and they see the dashboard.

## Required manual step — Supabase dashboard (Martin, not Codex)

In the Supabase dashboard → Authentication → URL Configuration → Redirect URLs, add:
```
https://project-cap.vercel.app/auth/reset-password
http://localhost:3000/auth/reset-password
```

Without this, every fix below is irrelevant — Supabase will keep ignoring the `redirectTo` and falling back to the Site URL.

Once these are added, clicking the reset link will redirect to `/auth/reset-password?code=xxx`. The existing PKCE exchange logic in the page already handles that correctly.

## Code task for Codex

**One file only: `app/auth/reset-password/page.tsx`**

After a successful `updateUser`, the user must be signed out before being sent to login. Currently `handleReset` does:

```ts
router.push('/')
router.refresh()
```

Replace those two lines with:

```ts
await supabase.auth.signOut()
router.push('/login')
```

No other changes. Do not touch the form, the exchange logic, the error states, or anything else in the file.

`tsc --noEmit` and `npm run lint` must still pass after the change.

## Expected end-to-end flow after both fixes

1. User requests a reset email.
2. User clicks the link → lands on `/auth/reset-password?code=xxx` → page shows "Verifying reset link…" → exchanges the PKCE code → shows the password form.
3. User submits a new password → `updateUser` succeeds → `signOut` is called → user is redirected to `/login`.
4. User logs in with the new password.

## What not to touch

- `app/login/page.tsx` — the `redirectTo` pointing at `/auth/reset-password` is already correct; do not change it.
- `app/auth/callback/route.ts` — not involved in this flow.
- `tasks/` — leave existing task files in place.
