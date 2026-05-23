# Fix: Password reset email redirects to login instead of set-new-password page

## Problem

When a user requests a password reset, the email link lands them on the login page instead of the "Set a new password" page.

**Root cause.** `resetPasswordForEmail` was called with:
```
redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`
```
Supabase's redirect URL whitelist matches on base path, so the `?next=` query param gets stripped. The callback route receives `?code=xxx` but `next` is gone, defaults to `/`, middleware sees no session, and the user ends up at `/login`.

**What has already been changed.**
`app/login/page.tsx` line ~109: `redirectTo` has been updated to:
```ts
redirectTo: `${window.location.origin}/auth/reset-password`,
```
This points Supabase directly at the reset-password page. Do not revert this.

## Task

Update `app/auth/reset-password/page.tsx` so that the page handles the PKCE code exchange itself before rendering the password form.

The current page assumes a session already exists and calls `supabase.auth.updateUser({ password })` directly. After the redirect change above, Supabase will land the user at `/auth/reset-password?code=xxxx` with no session — the page must exchange the code first.

## Implementation

**State to add:**
- `status: 'exchanging' | 'ready' | 'error'` — controls what renders; starts as `'exchanging'`
- `exchangeError: string` — set if `exchangeCodeForSession` fails

**On mount (`useEffect` with `[]` dependency):**
1. Read `code` from `window.location.search` (use `new URLSearchParams(window.location.search).get('code')`)
2. If no `code` present, check for an existing session via `supabase.auth.getSession()`. If a session exists, set status to `'ready'` and return. If no session and no code, set `exchangeError` to a message saying the link is invalid or expired and set status to `'error'`.
3. If `code` is present, call `await supabase.auth.exchangeCodeForSession(code)`.
   - On error: set `exchangeError` to the error message, set status to `'error'`
   - On success: set status to `'ready'`

**Do not use `useSearchParams()`** — it requires a `<Suspense>` boundary and the existing page is not structured that way. Read from `window.location.search` directly inside the `useEffect`.

**Render logic:**
- `status === 'exchanging'`: render a minimal loading state in place of the form. Use the same outer wrapper (`min-h-screen flex items-center justify-center bg-gray-50 px-4`) and card (`w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8`). A single `<p className="text-sm text-gray-400">Verifying reset link…</p>` inside the card is enough.
- `status === 'error'`: render an error card with `exchangeError` as the message and a link back to `/login` labelled "Request a new link". Same wrapper and card as above.
- `status === 'ready'`: render the existing password form exactly as it is now — no changes to the form UI, validation logic, or `handleReset` function.

## Constraints

- Touch only `app/auth/reset-password/page.tsx`. No other files.
- Do not change the existing form JSX, validation rules, or post-submit redirect.
- Do not introduce new dependencies.
- Keep the `createBrowserClient` instantiation where it is (module level, outside the component is fine, or move inside if needed for the hook — just be consistent with the existing pattern in the file).
- `tsc --noEmit` must pass after the change.
- Do not add comments unless something would genuinely confuse a reader without one.

## Verification

1. Request a password reset email.
2. Click the link — browser should land on `/auth/reset-password`, show "Verifying reset link…" briefly, then show the password form.
3. Enter a new password (≥ 8 chars, matching confirm) → submit → redirected to `/`.
4. Log in with the new password — should succeed.
5. Clicking an already-used or expired reset link should show the error card with a "Request a new link" anchor, not a blank page or a JS error.
