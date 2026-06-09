# Codex Task Spec — Onboarding Hardening (Shopify Callback Org Fix + Credential Encryption)

**Status:** ready for Codex
**Why now:** Both are "before any external seller's data enters the system" gates. We are about to concierge-onboard the first design partner. Ship as one batch.
**Branch:** `feature/onboarding-hardening` (single branch, may be split into two PRs if reviewer prefers — see "PR split" note).

There are two independent fixes in this spec. Do **Part A first** (small, isolated), verify, then **Part B** (wider surface). Do not interleave them in the same commit.

---

## Part A — Remove hardcoded ORG_ID from Shopify OAuth callback

### Problem
`app/api/shopify/callback/route.ts:7` hardcodes:
```ts
const ORG_ID = '00000000-0000-0000-0000-000000000001'
```
Every Shopify install writes `store_platforms.organization_id = ORG_ID`. With more than one org, a second tenant's Shopify install would land in the **default org** — a silent cross-tenant data leak. This is the only hardcoded org left in the codebase (every other route uses `ctx.organizationId` from `lib/getOrgId.ts`).

### Root-cause assumption (state it back if wrong)
The OAuth `state` is `\`${nonce}:${storeId}\`` (set in `app/api/shopify/install/route.ts:30`). The callback already extracts `storeId` from state (line 73). The `stores` row for that `storeId` was created through the authenticated `POST /api/stores` route, so it **already carries the correct `organization_id`**. Therefore the org must be **derived from the store**, never from a constant.

### Required change (callback — load-bearing)
In `app/api/shopify/callback/route.ts`, after `storeId` is validated and **before** the `store_platforms` upsert:

1. Delete the `ORG_ID` constant (line 7) and its TODO comment.
2. Look up the owning org from the store:
   ```ts
   const { data: store, error: storeErr } = await supabase
     .from('stores')
     .select('organization_id')
     .eq('id', storeId)
     .single()

   if (storeErr || !store) {
     console.error('Shopify callback: store not found for storeId', { storeId })
     return NextResponse.json({ error: 'Store not found' }, { status: 404 })
   }
   const organizationId = store.organization_id
   ```
3. Use `organizationId` in the `store_platforms` upsert (replace `organization_id: ORG_ID`).
4. Move this lookup to run **after** the existing `getSupabase()` call (the upsert already uses that client).

### Required change (install route — defence in depth)
`app/api/shopify/install/route.ts` is currently unauthenticated and trusts any `storeId` from the query string. Harden it so an attacker can't start an install that targets a store they don't own:

1. Call `requireAuth()` (from `@/lib/getOrgId`) at the top of `GET`. Return its `NextResponse` if unauthorized.
2. Verify the `storeId` belongs to `ctx.organizationId`:
   ```ts
   // fetch store, confirm store.organization_id === ctx.organizationId, else 404
   ```
   Use the service-role admin client or the authed server client consistently with how other store routes read. Return 404 (not 403) on mismatch to avoid leaking existence.
3. Leave the `nonce:storeId` state format and the `shopify_oauth_state` cookie unchanged — the callback's CSRF check still works, and org is now resolved server-side from the store at callback time.

### Do NOT
- Do **not** put `organization_id` into the OAuth `state` or cookie. The store→org mapping is a trusted DB lookup; putting org in client-roundtrip state just adds an attack surface.
- Do not change `SHOPIFY_WEBHOOK_TOPICS`, webhook registration, or the product-sync trigger.

### Acceptance criteria (Part A)
- [ ] No literal `00000000-0000-0000-0000-000000000001` remains in `app/api/shopify/callback/route.ts`.
- [ ] Callback resolves `organizationId` from the `stores` row; returns 404 if the store doesn't exist.
- [ ] `store_platforms` upsert writes the resolved org.
- [ ] Install route requires auth and 404s when `storeId` isn't in the caller's org.
- [ ] `tsc --noEmit` + ESLint clean.
- [ ] Manual two-org check (documented in PR description): install from a non-default org's store writes `store_platforms.organization_id` = that org, not the default.

---

## Part B — Encrypt platform credentials at rest

### Problem
`store_platforms` stores third-party secrets in **plaintext**: `bot_token` (Telegram), `access_token` (Shopify), `wa_access_token` (WhatsApp). Before we hold an external partner's credentials, these must be encrypted at rest. A DB leak today = full takeover of every connected store's messaging + Shopify admin.

### Approach — application-layer AES-256-GCM (do NOT use pgcrypto)
Encrypt/decrypt in the Node layer with a single env-provided key, so the key never lives in the database. Use a versioned, self-describing ciphertext format so reads can transparently handle both legacy plaintext and encrypted values during rollout.

1. **New helper `lib/credentialCrypto.ts`:**
   - `encryptSecret(plaintext: string): string` → returns `\`enc:v1:${ivB64}:${authTagB64}:${ciphertextB64}\``.
   - `decryptSecret(value: string | null): string | null`:
     - `null`/empty → return as-is.
     - starts with `enc:v1:` → decrypt and return plaintext.
     - otherwise → treat as **legacy plaintext**, return unchanged (so nothing breaks mid-migration).
   - Key: read 32-byte key from `process.env.CREDENTIAL_ENCRYPTION_KEY` (base64). Throw a clear error at call time if missing/wrong length. Cipher: `aes-256-gcm`, random 12-byte IV per encryption, store auth tag.
   - Pure functions, no Supabase import. Add minimal unit coverage if a test runner exists; otherwise a `scripts/` smoke check.

2. **Encrypt on every WRITE** of these columns. Wrap the value in `encryptSecret(...)` at:
   - `app/api/telegram/connect/route.ts` (writes `bot_token`)
   - `app/api/whatsapp/connect/route.ts` (writes `wa_access_token`)
   - `app/api/shopify/callback/route.ts` (writes `access_token`)
   - Any other `store_platforms` insert/upsert that sets these columns (grep `bot_token|access_token|wa_access_token` under `app/` — also check `app/api/stores/[storeId]/platforms/*`). Identifiers like `wa_phone_number_id`, `shopify_domain`, `account_label` are NOT secrets — leave them plaintext.

3. **Decrypt on every READ** at point of use. Wrap reads in `decryptSecret(...)`:
   - `lib/sendTelegramMessage.ts:44` — `const botToken = decryptSecret(platform?.bot_token) ?? process.env.TELEGRAM_BOT_TOKEN`
   - `lib/sendWhatsAppMessage.ts` — decrypt `wa_access_token` before building the `Authorization` header.
   - Shopify access-token reads: `lib/shopifyProductSync.ts`, `app/api/shopify/order/route.ts`, `app/api/shopify/reregister-webhooks/route.ts`, `app/api/shopify/webhook/route.ts`, `app/api/shopify/sync-products/route.ts`, `scripts/backfill-shopify-orders.ts`. Decrypt immediately after selecting the row, before the credential is used.
   - **Audit every `.select(...)` that pulls one of these columns** and ensure the value passes through `decryptSecret` before use. Missing one = a broken channel.

4. **Backfill existing rows** — `scripts/encrypt-credentials-backfill.ts` (runnable with `tsx`/`ts-node`, service-role client):
   - For each `store_platforms` row, for each of the 3 secret columns: if value is non-null and does NOT start with `enc:v1:`, re-write it as `encryptSecret(value)`.
   - Idempotent (already-encrypted rows skipped). Log counts per column. Dry-run flag (`--dry-run`) that reports what it would change without writing.
   - Do not put this in a SQL migration (encryption happens in Node, not Postgres).

5. **Never log decrypted secrets.** Confirm no `console.*` prints a token. The existing callback logs booleans only — keep it that way.

### Rollout ordering (document in PR)
Deploy code (reads handle both formats) → set `CREDENTIAL_ENCRYPTION_KEY` in all environments → run backfill (`--dry-run` first, then live) → verify channels still send. Because `decryptSecret` passes legacy plaintext through untouched, there is no hard cutover window.

### Acceptance criteria (Part B)
- [ ] `lib/credentialCrypto.ts` with `encryptSecret`/`decryptSecret`, AES-256-GCM, versioned `enc:v1:` format, legacy-plaintext passthrough on read.
- [ ] All writes of `bot_token` / `access_token` / `wa_access_token` encrypt; all reads decrypt at point of use. No call site missed (grep-verified list in PR).
- [ ] Idempotent backfill script with `--dry-run`.
- [ ] No secret is ever logged.
- [ ] `tsc --noEmit` + ESLint clean.
- [ ] Behavioural check after backfill on preview: Telegram send, WhatsApp send, and one Shopify read (order lookup or product sync) all still work with encrypted values.

### Codex limitation
Codex sandbox has no `CREDENTIAL_ENCRYPTION_KEY` and no live secrets — it cannot behaviourally verify send/decrypt end to end. Implement + tsc/lint + unit-test the crypto round-trip; the channel-send verification happens on preview with the real key (Melvin).

---

## PR split (reviewer's choice)
Acceptable as one PR if kept in two clearly separated commits (A, then B). Prefer two PRs if review is cleaner that way — Part A is safe to merge and deploy on its own immediately; Part B should not merge until `CREDENTIAL_ENCRYPTION_KEY` is set in production, or the first encrypted write will be unreadable.

## Out of scope (do not touch)
- Key rotation tooling (single key v1 is enough now; format is versioned so v2 can come later).
- Moving to a dedicated secrets manager (KMS/Vault) — revisit post-PMF.
- The GitHub-token-in-git-remote rotation (separate manual hygiene item, Melvin handles).
