# CONTEXT.md — Project CAP Living State

**Last verified: 2026-07-18.** This is the fast-moving layer: what's actually true right now, what to work on next, and the traps that aren't obvious from the code. It will drift — treat anything below as stale if the date is more than ~2 weeks old, and re-sync (see "Keeping this fresh" at the bottom).

For the stable stuff, read these first and don't expect this file to repeat them:
- **`AGENTS.md`** (repo root) — the canonical engineering doc: product definition, tech stack, architecture, channel-adapter pattern, normalised types, scope traps, code standards, review checklist. This is what Codex/Claude Code read.
- **`CLAUDE.md`** (repo root) — thin entry point only: imports `@CONTEXT.md` + `@AGENTS.md`, plus the two non-negotiables (Vercel-only deploy, `organization_id` tenant isolation) and the pre-push rule.

(Note: the *outer* Cowork `Project CAP/CLAUDE.md` — a different file, not in this repo — holds the business/product framing. Claude Code launched from this repo cannot see it; rely on `AGENTS.md` here.)

Where this file and those two disagree, **this file wins** (it's newer). Known drifts are flagged inline below.

---

## Corrections to the stable docs (read these — they're load-bearing)

- **No Railway. Vercel only.** `CLAUDE.md` and `AGENTS.md` say "Vercel (frontend) + Railway (workers)". That was the *intended* architecture and was never built. There is no `railway.json`/`Procfile`/worker entrypoint/cron/queue. Everything — credential decryption, message sending, the AI queue — is a Next.js API route on Vercel. **Never tell Melvin to set env vars or deploy on Railway; he has no Railway account.** Env vars live in exactly two places: Vercel project settings + local `.env.local`.
- **Auth is live.** The hardcoded org UUID (`00000000-0000-0000-0000-000000000001`) is gone from tenant-scoped routes. Supabase Auth + RBAC (`owner`/`admin`/`agent`) via `lib/getOrgId.ts`. Admins can manage agent-level team/settings surfaces but are not owners for transfer, delete, admin invites, or admin removal. Any memory or doc implying "auth comes later" is stale.
- **`AGENTS.md` current-state section understates progress** — it still says "Shopify Phase 2 (catalogue sync) not built". Catalogue sync, RAG, KB, RLS, WhatsApp adapter, and auto-send wiring all shipped since. Trust the state below.

---

## Stack specifics that bite

- **Supabase project ID:** `eoyolzalpwjakjdgdgck` (region ap-southeast-2 / Sydney). API URL `https://eoyolzalpwjakjdgdgck.supabase.co`.
- **Production = `project-cap.vercel.app` = `main` branch.** Branch previews have long auto-generated URLs (e.g. `project-cap-git-feature-…-melvin-s-projects2.vercel.app`). Don't confuse a preview verdict with production.
- **AI router** (`lib/aiRouter.ts`): `gpt-5.4-nano` (classification/intent/language/routing), `gpt-5.4-mini` (default reply), `gpt-5.4` standard (escalation only). `temperature: 0` everywhere. Do NOT default to `gpt-5.5`.
- **Local `.env.local` has no `OPENAI_API_KEY`** by default → anything that calls the model (e.g. KB conflict check) **fails open** locally and in the Codex sandbox. Behavioural AI verification must happen on a Vercel preview/prod with the key set, not locally.
- **Migrations now auto-apply via CI — stop applying by hand.** `.github/workflows/db-migrations.yml` runs `supabase db push --db-url` on every merge to `main` that touches `supabase/migrations/**`. The old failure mode was: migrations landed in the repo but reaching prod was a manual step that got silently skipped (this is how `order_reference` and the WhatsApp columns ended up missing live on 2026-06-04). **Do NOT apply migrations via the Supabase dashboard/MCP `apply_migration` anymore** — that stamps a *fresh* timestamp into `schema_migrations` instead of the file's, which is exactly what drifted the history. Create migrations with `supabase migration new` and let the merge apply them. **Pending Melvin:** set the GitHub repo secret **`SUPABASE_DB_URL`** (Session-pooler or Direct connection string — NOT the Transaction pooler on `:6543`). Until it's set the workflow skips gracefully (logs a warning, exits 0).
- **Migration history was reconciled on 2026-06-04.** Local filenames in `supabase/migrations/` now match the prod `schema_migrations` ledger exactly (39 ≡ 39). Six previously-drifted files were renamed to the versions prod recorded, one prod-only migration with no repo file (`fix_search_store_products_word_sim_operand`) was recovered into a file, and the `order_reference` + `whatsapp_adapter` migrations were applied. If you ever see local-vs-ledger version mismatches again, the cause is someone bypassing CI and applying by hand (see above).
- **iCloud-mount git lock gotcha:** the repo lives on an iCloud-synced mount; `.git/index.lock` sometimes can't be unlinked from a sandbox ("Operation not permitted"). Workaround used repeatedly: commit/push via a fresh clone in `/tmp`. If you hit it, Melvin must `rm -f .git/index.lock` from his own Mac terminal and clean up any half-made local branch.

---

## Current engineering state (what exists, verified 2026-06-03/04)

**Shipped and live on `main`:**
- Next.js 14 + Tailwind + shadcn/ui inbox against Supabase (`conversations`, `messages`, `customers`, `stores`, `store_platforms`, `store_ai_config`, `user_profiles`, `organizations`, `store_knowledge`, `store_products`, `store_product_sync_state`).
- **Auth + RBAC** (Supabase Auth, owner/admin/agent, `lib/getOrgId.ts`; admin role shipped 2026-07-18).
- **RLS tenant isolation** (PR #9, deployed 2026-06-01): RLS on all 13 public tables, org-scoped per-command policies via `private.auth_org_id()`; two-org isolation test passes; advisors clean.
- **Telegram adapter** — complete (webhook in, outbound send, connect/disconnect).
- **Shopify adapter** — OAuth install/callback + `orders/create` webhook; product catalogue sync (`/api/shopify/sync-products`, webhook product create/update/delete, `store_product_sync_state`, catalogue panel). Webhook registration via **GraphQL** `webhookSubscriptionCreate`, not REST.
- **AI suggestion loop** — two-queue router, language hardening, prompt-injection sanitisation, locked platform guardrails + seller custom guardrails (LLM-screened), confidence capping when no data. **Order grounding now fires for `order_status` AND `shipping` intents** (2026-06-04: `shipping` added to `ORDER_INTENTS` in `lib/orderRetrieval.ts` + Queue-1 classifier prompt disambiguated in `lib/aiRouter.ts`, so "where's my order / has it shipped" classifies as an order query and pulls real `customer_orders`; `sourceCited: order_history` confirmed live). ⚠️ This grounding is currently **ungated** — order_history is injected whenever the chat's customer is linked, so disclosure relies on the guardrail/model, not on verifying the person owns the order. The disclosure-gating work below closes this.
- **Knowledge base (policy/FAQ)** — DONE end to end (PRs #10–#14): FTS+trigram retrieval, seller-editable KB tab, **KB is now the source of truth for policies** (`store_ai_config.return_policy`/`shipping_policy` columns dropped), dedup + save-time AI conflict check (both kinds, advisory-with-override, fail-open), nano auto-tagging on create.
- **Customer identity resolution + CRM** — `customers` table, merge RPC, `lib/identity-resolution.ts`, Shopify webhook auto-creates profiles, full `/customers` page, manual + suggested merges, uniform contact card.
- **Phone normalisation** — shared `lib/phone.ts` (`libphonenumber-js`), backfill applied.
- **WhatsApp Cloud API adapter** — **ON HOLD pending company incorporation + Meta Business Portfolio.** Code merged (PR #15) and the DB schema is in place (verified live 2026-06-09: `customers.whatsapp_id`, `store_platforms.wa_phone_number_id`/`wa_access_token` exist; migration `20260604110320` recorded as applied). The adapter is **unwired and unused** — do not progress WhatsApp infra (test number, connect flow, registry exposure) until the company entity exists. Only the schema is live; nothing is connectable.
- **Cross-channel orders-history panel** + Shopify order backfill (PR #16).
- **Credential encryption at rest** — `lib/credentialCrypto.ts` AES-256-GCM, `enc:v1:` format, legacy-plaintext passthrough. Encrypt on write / decrypt at use for Telegram, WhatsApp, Shopify secrets. Requires `CREDENTIAL_ENCRYPTION_KEY` (set in Vercel prod+preview + `.env.local`). Onboarding-hardening batch merged to main 2026-06-03 (commit d0b440f). **Pending Melvin:** run the live backfill (`npx tsx scripts/encrypt-credentials-backfill.ts`, no `--dry-run`) + smoke test (Telegram send + Shopify read).
- **Auto-send** — fully wired (`lib/autoSend.ts` + `app/api/ai/suggest/route.ts`), **but running in SHADOW MODE** (see priorities #1 below).

**Not built yet:**
- Shopee / Lazada / TikTok Shop adapters (externally blocked — see marketplace access below).
- Shopify reply path (permanently impossible — Shopify Inbox has no public API; Shopify conversations should be order-context cards, not chat threads).
- pgvector semantic RAG (deferred; lexical FTS is correct for now).
- Dashboard revenue/orders/marketplace cards (still `EmptyMetricCard`); top topics + customer signals still mock.

---

## Priority stack — what to work on next (as of 2026-06-04)

The honest headline: **engineering is no longer the bottleneck.** The product is broadly sellable. The next real move is a design partner + graduating auto-send on their traffic, not more building.

**Open strategic decision (as of 2026-06-04): which channel the design partner runs real traffic on is undecided** — and that's the fork that should drive the next moves, not the feature backlog. Telegram is the only live two-way channel, but most ICP marketplace sellers' real CS pain is in Shopee/Lazada/TikTok in-app chat, so a Telegram-only partner validates a workflow that isn't quite the ICP's. Two coherent strategies: **(A)** recruit a Telegram-native partner and start producing real traffic now (zero channel work; spend the build budget on auto-send trust + KB cold-start); **(B)** commit to a true-ICP marketplace seller, which makes the **TikTok Shop adapter the critical path** (only unblocked beachhead channel — TSP partner program). Recommended: run A now, start B in parallel — **the TSP registration + company-incorporation paperwork is the long pole, not the adapter code**, so start that clock early even if the adapter is built later. The channel decision changes *who you recruit and which external clock starts*, not what to code next: auto-send trust tooling + KB cold-start + reliability are channel-agnostic and come first regardless.

**In flight — handed to Codex 2026-06-04:** Identity-gated order disclosure on Telegram (`specs/spec-order-disclosure-verification.md`). Gates AI disclosure of order status/tracking behind the customer proving they own the order: disclosable if the customer **recently mentioned the order number** OR **gave a postcode matching one of their orders** (postcode lives in `customer_orders.raw_payload.shipping_address.zip`) — all matched in **deterministic code, never the LLM**. Adds `conversations.verified_order_ids`. *Why:* phone/Telegram linkage is fuzzy and recyclable, so it can't be treated as authorization (recycled number → could inherit a stranger's order history; PDPA risk). *Accepted MVP risk:* order-number-alone reopens the recycled-number gap (order numbers are guessable/sequential) — Melvin chose lower friction; documented in the spec with opt-in mitigations. *Phase 2 (out of scope):* org-wide relink to recover the "customer changed number" case, brute-force attempt caps, non-Telegram channels.

In rough order:

1. **Graduate auto-send out of shadow mode** — THE flagship value prop ("60–70% handled autonomously") is built but switched off. `isConfidenceCalibrationShadowMode()` defaults TRUE; calibration computes/logs promotions but they don't drive live sends. To graduate: review `confidence_calibration` JSON log lines on **real** traffic, confirm false-promote rate is low, then set `CONFIDENCE_CALIBRATION_SHADOW=false`. Gated on having a real seller producing traffic. (`lib/autoSend.ts`, `app/api/ai/suggest/route.ts`.)
2. **Stop Shopify `orders/create` from creating conversations** — product decision: orders are operations, not customer service. Webhook still creates conversations; remove that so Shopify data surfaces only via the orders panel on a live conversation.
3. ~~**Rotate the GitHub token embedded in the git remote URL**~~ — **DONE 2026-06-04.** `origin` switched to SSH (`git@github.com:melvinong1701/Project-CAP.git`) via a new ed25519 key; old PAT revoked in GitHub. Remaining same-class hygiene: don't commit/share `CAP-CRM-apps-script.gs`/`.txt` (carries the CRM `SHARED_SECRET`).
4. **pgvector semantic RAG** (`specs/spec-rag-pgvector-semantic.md`) — deferred until real multilingual traffic.
5. **Shopee / Lazada / TikTok adapters** — the actual beachhead channels, but externally blocked (see below).

**Lower-priority known issues (don't proactively fix; flag if touched):**
- Dashboard loading UX: `ChannelMixBlock` + `LanguageBreakdownBlock` show empty text during load; `OpenQueueBlock` has a proper skeleton. Add matching skeletons in a polish pass.
- Optional defence-in-depth: user-facing read routes (`/api/conversations`, `/api/org`, `/api/stores`) use the service-role client with an app-level `.eq('organization_id', …)` — RLS doesn't guard these (service role bypasses it); the app filter is the only boundary. Could switch to the authenticated server client. Queued, not blocking.

---

## Roadmap (volatile — re-confirm before relying on it)

Original masterplan phasing (`Development Phases.md`) is largely overtaken by reality; the *intent* still holds. Long-term framing (`project_cap_vision`): CAP is sold as a chat aggregator but **architected as a commerce OS** — chat is the wedge, the unified data layer (inventory, orders, catalogue, customers, conversations) grounding the AI is the moat.

- **Now → first design partner:** graduate auto-send on real traffic; onboard one real seller; finish credential-encryption backfill. (Engineering largely done; this is go-to-market.)
- **First 3–5 paying customers:** WhatsApp live (unblocked once company entity/Meta Business Portfolio exists), more AI skills, Manager role + dashboard data, read-only inventory.
- **Scaling:** TikTok Shop adapter (lowest-friction marketplace), then Shopee/Lazada with guided per-seller onboarding; multichannel inventory write-back; plan-tier model routing.
- **Platform:** public webhooks, community adapters, org-specific fine-tunes, ad-spend integration.

Architectural principles to weigh every decision against: modular monolith with clean domain boundaries (extractable later, not microservices yet), unified internal data model (adapters translate in; AI/UI never see raw platform data), AI as a registry of pluggable/swappable skills, event bus for inter-module comms, RBAC + `organization_id` everywhere from Day 1. Full write-up: `OUTPUTS/Architecture - Modular Platform Design.md`.

---

## Marketplace chat-API access (the external blocker on the beachhead channels)

| Platform | Chat API | ISV access | Onboarding |
|---|---|---|---|
| Shopee | Yes (OpenAPI v2.0) | Blocked for ERP/ISV app type | Each seller registers own dev app as "Seller In-house System", ~3-day review, passes Partner ID/Key |
| Lazada | Yes (IM Open API) | Blocked for ISV/ERP | Each seller registers "In-house IM Chat" app + CAP whitelists each Seller ID |
| TikTok Shop | Yes (Customer Service API) | **Yes — proper TSP partner program** | CAP registers once as TSP; sellers authorise CAP's pre-approved app from Seller Center |

**Implication:** TikTok Shop is the smoothest adapter to build after Telegram. Shopee/Lazada are solvable but need guided/white-glove per-seller onboarding — turn that friction into a differentiator. Auth periods ~1 year then re-auth.

**WhatsApp/Meta:** on hold pending **company incorporation + Meta Business Portfolio** (required even for a test number now). Don't progress WhatsApp infra until the entity exists. Costing note: CAP sits in Meta's free service-window bucket, so message cost for a support inbox is near-zero; go Graph-direct via Cloud API. Details in `OUTPUTS/WhatsApp-Meta-Costing/`.

---

## Workflow norms

- **Codex does the implementing.** The pattern here is: write a clear task spec (see `specs/` and `Codex Task Spec Template.md`), Codex implements. When acting as the coding agent directly, prefer writing/refining the spec over silently implementing large changes — but Melvin also writes code himself.
- **Before pushing on Melvin's changes:** run `tsc --noEmit` + ESLint, then push to `origin main` (a pre-push hook enforces this too). No need to ask first.
- **Naming:** working name is **Project CAP**. Never surface the old names "OakChat"/"OpenChat" in new work unless quoting historical source.
- **Migrations** are tracked in `supabase/migrations/`; `specs/` is intentionally untracked working notes.

---

## Keeping this fresh

The state and priorities above are the parts most likely to go stale. When they change materially:
1. Update this file and bump the "Last verified" date at the top.
2. If a fact is durable enough that a future Cowork session should also know it, it lives in Cowork memory — ask the Cowork assistant to re-export the engineering memories into this file so the two stay in sync. (This file was generated from those memories on 2026-06-04.)
3. Keep `CLAUDE.md`/`AGENTS.md` for stable definitions; keep churn here.
