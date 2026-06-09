# Codex Task Spec — RLS / Tenant-Isolation Hardening

**Type:** `build`
**Priority:** `P0 – ship now`
**Branch:** `feature/rls-tenant-isolation-hardening`

---

## Goal

Make tenant isolation provably correct and reproducible before any external seller's data lands in production. Today six tables have Row Level Security disabled (open to the public anon key), no `CREATE POLICY` statements exist in any migration, and the browser reads sensitive tables directly with the anon key. This task closes the open tables, brings all RLS policies into version-controlled migrations, and removes direct browser access to sensitive data — without breaking the running app.

---

## Context

**Confirmed live audit — Supabase security advisor, project `eoyolzalpwjakjdgdgck`, run 2026-06-01.** These are facts, not hypotheses. Refresh them in Scope step 0 (the DB may have drifted), but the picture below is what the linter currently reports. Every table in `public` falls into one of three buckets:

- **Bucket A — RLS OFF entirely (wide open to the public anon key, read AND write).** Advisor level: `ERROR / rls_disabled_in_public`. Six tables, all holding sensitive data:
  `customers`, `customer_merge_suggestions`, `customer_merges`, `customer_orders`, `organizations`, `user_profiles`.
- **Bucket B — RLS ON but with a permissive `allow_all` policy (`USING (true)` / `WITH CHECK (true)`).** Advisor level: `WARN / rls_policy_always_true`. These are *just as exposed as Bucket A* — RLS is technically enabled, but the policy lets any role do anything to any org's rows. Four tables:
  `conversations` (policy `allow_all_conversations`), `messages` (`allow_all_messages`), `stores` (`allow_all_stores`), `store_platforms` (`allow_all_store_platforms`).
- **Bucket C — RLS ON, NO policy (deny-all to anon/authenticated; reachable only via the service-role admin client).** Advisor level: `INFO / rls_enabled_no_policy`. These are *not* currently leaking, but they have no positive policy, so the authenticated-user path can't read them — the app reaches them through `supabaseAdmin`. Three tables:
  `store_ai_config`, `store_products`, `store_product_sync_state`.
- **There are still no `CREATE POLICY` statements in any file under `supabase/migrations/`.** The Bucket B `allow_all_*` policies were created out-of-band in the Supabase dashboard — policies-as-code does not exist yet. A fresh DB built from migrations alone would NOT reproduce production. This is its own problem and this task fixes it.
- **Two lower-severity advisor items, in scope to fix cheaply since this task already touches DDL:** `function_search_path_mutable` on `set_updated_at` and `merge_customers` (`WARN`) — set an explicit `search_path` on both. One item is out of scope (dashboard toggle, not code): leaked-password protection is disabled in Auth — flag it in the PR for Melvin to enable, do not try to fix in code.
- **The browser uses the anon key and reads sensitive tables directly.** `lib/supabase.ts` exports a `createBrowserClient` anon client. `app/page.tsx` (the inbox, a client component) calls `.from('user_profiles')`, `.from('conversations')`, `.from('messages')`, and `.from('customers')` on it directly.
- **Three Supabase clients exist:**
  - `lib/supabase.ts` — browser anon client (`NEXT_PUBLIC_SUPABASE_ANON_KEY`).
  - `lib/supabaseServer.ts` — SSR server client, anon key + the logged-in user's cookies (RLS applies as that user).
  - `lib/supabaseAdmin.ts` — `createSupabaseAdminClient()`, **service-role key — bypasses RLS entirely.**
- **Org scoping helper exists:** `lib/getOrgId.ts` resolves `{ userId, organizationId, role }` from the session via `user_profiles`. Most API routes already call `getOrgId` / `requireAuth` / `requireOwner` and filter queries by `organization_id` in application code.
- The hardcoded org UUID era is over — real auth (`20260522000001_auth_organizations`) and `user_profiles` are live. There is currently 1 org, 1 user profile, 5 customers (test data).

The core risk: application-code `organization_id` filters are not a security boundary. Anyone with the anon key (which is public, shipped to the browser) can query the ten exposed tables (Bucket A + Bucket B) directly and read or modify every org's rows — including every seller's customers, orders, conversations, and message contents. RLS with org-scoped policies is the only real boundary. There is little real data today (1 org, 1 user, ~5 test customers), which is exactly why this must be fixed *before* external sellers onboard, not after.

---

## Scope — what to build

### 0. Refresh the audit, then change (required — do not skip)
- [ ] Re-run the Supabase security advisor and `select schemaname, tablename, policyname, cmd, qual, with_check from pg_policies where schemaname = 'public'`. Confirm the three-bucket picture in Context still holds (it may have drifted since 2026-06-01). Record the result in the PR description.
- [ ] For each of the three Supabase clients, list which tables it touches and from where (browser vs server route vs webhook). Confirm whether each sensitive-table read path runs as: anon (browser), authenticated user (SSR cookies), or service role (admin). This determines what each policy must allow — in particular, the Bucket C tables currently work *because* they go through the admin client; org-scoped policies must not break those paths, and adding an authenticated-read policy must not accidentally open them to the wrong org.
- [ ] Write the findings into the PR description as a short table before making changes. If the audit contradicts anything in the Context section above, follow the audit.

### 1. Bring all RLS policies into migrations (policies as code)
- [ ] Create a single new migration that declares the full, intended RLS policy set for every table in `public`, idempotently (`drop policy if exists` then `create policy`, or `create policy ... if not exists` patterns as supported). After this migration, the migration files are the source of truth — a fresh DB built from migrations alone must end up with the same policies as production.
- [ ] For the RLS-ON tables that currently have dashboard-only policies, reproduce them in the migration (corrected to org-scoped where they were permissive).

### 2a. Close the six wide-open tables (Bucket A)
- [ ] Enable RLS on `customers`, `customer_merge_suggestions`, `customer_merges`, `customer_orders`, `organizations`, `user_profiles`.
- [ ] Add org-scoped policies so an authenticated user can only see/modify rows belonging to their own `organization_id`. The org for the current user comes from `user_profiles` — use a `SECURITY DEFINER` helper function `auth_org_id()` (explicit `search_path`, returns the caller's `organization_id` from `user_profiles where id = auth.uid()`), and scope policies as `organization_id = auth_org_id()`. The helper being `SECURITY DEFINER` also avoids infinite recursion when `user_profiles`' own policy needs the caller's org.
  - `user_profiles` itself: a user may read their own profile and other profiles in the same org; restrict writes appropriately (a user editing their own row; owner editing org members — match the existing role model in `getOrgId.ts`: `owner` vs `agent`). Note: the `20260522000001_auth_organizations` migration's CHECK constraint allows `('admin','agent')` while `getOrgId.ts` maps to `('owner','agent')` — flag this mismatch in the PR; do not silently "fix" it here.
  - `organizations`: a user may read only their own org row.
  - `customer_orders` / merge tables: scope by `organization_id` like `customers`.

### 2b. Replace the permissive allow_all policies (Bucket B)
- [ ] `conversations`, `messages`, `stores`, `store_platforms` each have a dashboard-created `allow_all_*` policy that is `USING (true) WITH CHECK (true)` — effectively no isolation. Drop each `allow_all_*` policy and replace with org-scoped policies (`organization_id = auth_org_id()`), declared in the same migration. `messages` carries its own `organization_id` (confirmed in `20260515000000_telegram_inbox.sql`), so scope it directly rather than via a join to `conversations`.
- [ ] Realtime caveat: the browser subscribes to `conversations` / `messages` via the anon client carrying the user's session. The new org-scoped SELECT policies must still allow that authenticated user to read their own org's rows, or the live inbox stops updating. Verify the realtime subscription still fires after tightening.

### 2c. Add authenticated-read policies for the service-role tables (Bucket C) — only if needed
- [ ] `store_ai_config`, `store_products`, `store_product_sync_state` are RLS-on / no-policy and reached via the admin client today. If (and only if) step 0 shows an authenticated-user path reads them, add an org-scoped SELECT policy. Otherwise leave them deny-all to anon/authenticated and note in the PR that they remain service-role-only by design. Either way, declare their state in the migration so it's reproducible.
- [ ] Service-role access (the admin client) bypasses RLS by design — confirm the routes that legitimately need cross-cutting access use `createSupabaseAdminClient()` and are server-only. Do **not** widen any policy just to keep a browser query working — fix the query instead (see step 3).

### 2d. Minor advisor hardening (cheap, since the migration already touches DDL)
- [ ] Set an explicit `search_path` on `set_updated_at` and `merge_customers` to clear the `function_search_path_mutable` warnings.

### 3. Move sensitive reads off the browser anon path
- [ ] `app/page.tsx` must not read `customers`, `user_profiles`, or any sensitive table directly via the browser anon client. Replace those direct `.from(...)` calls with fetches to existing (or new) authenticated API routes that resolve the org via `getOrgId` and query server-side.
  - There are already customer API routes (`app/api/customers/...`) and conversation routes — prefer reusing them over adding new ones.
  - `conversations` / `messages` may remain on an authenticated, RLS-protected path **only if** their policies are genuinely org-scoped (verified in step 0). If they currently rely on permissive policies, tighten them too.
- [ ] After the change, the browser anon client should only ever touch data that is safe under org-scoped RLS for the logged-in user — never another org's rows, never service-role-only data.

### 4. Verify isolation holds
- [ ] Add a short SQL or script check (can live in `scripts/`) that, given two org contexts, confirms one org cannot read the other's `customers` / `conversations` / `customer_orders` rows. With only one org in the DB today, seed a second throwaway org in the check or document the manual two-account test in the PR.

---

## Files to create / modify

| Action | Path | Notes |
|--------|------|-------|
| Create | `supabase/migrations/<timestamp>_rls_policies_as_code.sql` | `auth_org_id()` helper; enable RLS on the 6 Bucket A tables; drop the 4 `allow_all_*` policies and replace with org-scoped ones; reconcile Bucket C state; set `search_path` on `set_updated_at` + `merge_customers`; idempotent (`drop policy if exists` then `create policy`) |
| Modify | `app/page.tsx` | Remove direct browser-anon reads of `customers` / `user_profiles`; route through authenticated API |
| Modify | `app/api/customers/...` and/or new route(s) | Server-side, org-scoped reads to replace the browser queries (reuse existing routes where possible) |
| Create | `scripts/verify-tenant-isolation.<ts\|sql>` | Two-org isolation check |

---

## Acceptance criteria

- [ ] `pg_policies` shows org-scoped (not `using (true)`) policies on all six Bucket A tables, plus RLS enabled on them.
- [ ] The four `allow_all_*` policies (Bucket B) are gone, replaced by org-scoped policies on `conversations`, `messages`, `stores`, `store_platforms`.
- [ ] A fresh database created from `supabase/migrations/` alone reproduces the full production policy set (policies are as-code) — no dashboard-only policies remain.
- [ ] Using only the public anon key (no valid session), a direct query to any Bucket A or Bucket B table returns zero rows / is rejected.
- [ ] A logged-in user in org A cannot read or modify org B's rows in any table (demonstrated by the verify script or documented manual test).
- [ ] `app/page.tsx` no longer calls `.from('customers')` or `.from('user_profiles')` on the browser anon client; the inbox still loads and the realtime conversation/message stream still updates for the logged-in user.
- [ ] The Supabase advisor re-run is clean of `rls_disabled_in_public` (ERROR) and `rls_policy_always_true` (WARN); `function_search_path_mutable` clears for `set_updated_at` and `merge_customers`. Any remaining items (e.g. leaked-password protection) are listed in the PR with a note on why they're out of code scope.
- [ ] `tsc --noEmit` passes; `npm run lint` passes.
- [ ] No new `any` types introduced.

---

## Do NOT do

- ❌ Do not enable RLS without adding policies in the same migration — that silently breaks every read on the table (the Supabase advisor explicitly warns about this).
- ❌ Do not "fix" a broken browser query by adding a permissive `using (true)` policy — that re-opens the hole. Move the query server-side instead.
- ❌ Do not move legitimate service-role/admin operations onto the anon path.
- ❌ Do not change the auth flow, NextAuth/Supabase-auth wiring, or the `owner`/`agent` role model — only enforce isolation on top of it.
- ❌ Do not touch the AI retrieval routes or any unrelated feature in this task.

---

## Decisions already made

- RLS (org-scoped policies) is the isolation boundary — application-code `organization_id` filters are kept but are not trusted as the boundary.
- Org identity for policies is derived from `user_profiles.organization_id` for `auth.uid()`, via a `SECURITY DEFINER` helper.
- Policies are version-controlled in migrations; dashboard-only policies are reconciled into code, not left as-is.
- Sensitive reads belong on authenticated server routes, not the browser anon client.

---

## Out of scope (follow-up tasks)

- Field-level encryption / PII redaction at rest — separate task.
- Audit logging of data access — separate task.
- Penetration test / external security review — business decision, separate from this code task.
- Rotating the existing anon/service-role keys — ops task; flag in summary if you believe a key was ever committed.
- Enabling leaked-password protection in Supabase Auth — a dashboard toggle, not code; flag it in the PR for Melvin to switch on.

---

## How to deliver

1. Work on branch `feature/rls-tenant-isolation-hardening`.
2. Open a PR against `main` with a one-paragraph summary.
3. In the PR description: include the step-0 audit table (current policies + which client touches which table), the chosen `auth_org_id()` definition, the list of browser queries moved server-side, and how isolation was verified.
4. Do not merge — this is a P0 security change and must be reviewed before merging.
