# Codex Task Spec — Consolidate AI Suggestion Pipeline (single server-authoritative path + auto-send guard)

**Type:** `fix` (architectural)
**Priority:** `P0 – ship now` (auto-sending wrong answers to real customers today)
**Branch:** `feature/consolidate-suggestion-pipeline`

---

## Goal

Today, every inbound Telegram message generates an AI suggestion **twice**, via two divergent paths, and auto-send only works if a browser inbox happens to be open. This produces wrong auto-sent replies, a stale "Show AI draft" after sending, and double OpenAI cost. Consolidate to **one server-authoritative generation path** that always does catalog retrieval, applies a hard auto-send guard, sends from the server, and writes a single suggestion. The browser becomes a pure renderer.

---

## Context — the current (broken) behaviour

Two independent generations fire per inbound customer message:

1. **Telegram webhook** (`app/api/telegram/webhook/route.ts:159-189`): builds `suggestInput` with `retrievedContext: []` — **no catalog retrieval** — calls `suggestReply`, writes `conversations.ai_suggestion` with `autoSent: false`, and **never sends**. Produces an ungrounded "let me check / please clarify" suggestion.

2. **Browser inbox** (`app/page.tsx:489-534`): on the Supabase realtime `messages` INSERT for a customer message, calls `POST /api/ai/suggest`. **That** route (`app/api/ai/suggest/route.ts`) does catalog RAG (`fetchCatalogContext`, `CATALOG_INTENTS`), generates a grounded reply, **and auto-sends** when `auto_send_enabled` && `confidence === 'high'`, then writes `ai_suggestion` with the real `autoSent`.

The two race on writing `conversations.ai_suggestion` (last writer wins), generate different content (only path 2 sees the catalog), and only path 2 sends — so **auto-send depends on a browser being open**. Observed bugs: a HIGH ungrounded/incorrect reply auto-sent on an availability question; a MID draft left visible after send; two different-quality answers for one message.

Relevant existing pieces:
- `app/api/ai/suggest/route.ts` holds `fetchCatalogContext()`, `CATALOG_INTENTS`, the context-carry query builder (`buildCatalogSearchQuery`), and the auto-send block.
- `lib/aiRouter.ts` holds `preprocessMessage`, `suggestReply`, `PreprocessingResult` (has `intent`).
- `lib/sendTelegramMessage.ts` sends an outbound Telegram reply.
- Client realtime already subscribes to `conversations` UPDATE (`app/page.tsx:546`) and maps `ai_suggestion` (`:561`) — so a server-written suggestion already refreshes the UI without the client generating anything.

---

## Decision (locked) — server-authoritative

- The **Telegram webhook** is the single owner of suggestion generation, catalog retrieval, the auto-send decision, sending, and the `ai_suggestion` write for inbound customer messages.
- The browser **stops generating** on inbound. It only renders `ai_suggestion` via the existing realtime subscription.
- `POST /api/ai/suggest` remains, but **only** for the manual "Retry AI" action (`onRetryAi` / `handleRetryAi`). It must use the exact same shared retrieval + auto-send-eligibility logic so manual and automatic behave identically.

---

## Scope — what to build

### 1. Extract shared logic into a lib
- [ ] Create `lib/catalogRetrieval.ts` and move `CATALOG_INTENTS`, `fetchCatalogContext`, and `buildCatalogSearchQuery` (+ its helpers) out of `app/api/ai/suggest/route.ts` into it. Both the webhook and the suggest route import from here. No behaviour change to retrieval itself.
- [ ] Create a shared `lib/autoSend.ts` (or add to an existing lib) exposing a single function that decides auto-send eligibility — see item 3 — so the rule lives in exactly one place.

### 2. Webhook becomes the full pipeline
- [ ] In `app/api/telegram/webhook/route.ts`, after `preprocessMessage`, run catalog retrieval (same as the suggest route: only for `CATALOG_INTENTS`, using `buildCatalogSearchQuery`) and pass the results as `retrievedContext` into `suggestReply`. Remove the hardcoded `retrievedContext: []`.
- [ ] Apply the auto-send guard (item 3). When eligible, send via `sendTelegramMessage` and write `ai_suggestion` with `autoSent: true`; otherwise write `autoSent: false`.
- [ ] This must run server-side regardless of any open browser.

### 3. Hard auto-send guard (not just model confidence)
- [ ] Auto-send may fire only when ALL of: `auto_send_enabled === true`, `confidence === 'high'`, AND `preprocessing.intent` is NOT in a blocked set. **Blocked set: `availability`, `pricing`, `refund`, `dispute`, `returns`.** (Availability/stock and pricing claims must never auto-send without live inventory data; refund/dispute/returns are already escalation territory.)
- [ ] `order_status` and `shipping` may auto-send only if HIGH (they're the safe factual cases). `product_question` may auto-send if HIGH.
- [ ] Put this rule in the shared `lib/autoSend.ts` function; both the webhook and `/api/ai/suggest` call it. No path may auto-send by checking `confidence === 'high'` alone.

### 4. Remove the client-side generation on inbound
- [ ] Delete the `fetch('/api/ai/suggest', …)` block in `app/page.tsx` (~lines 489-534) that fires on inbound customer messages. The existing `conversations` UPDATE realtime subscription already renders the server-written suggestion.
- [ ] Keep the manual retry path (`onRetryAi` → `/api/ai/suggest`) working.

### 5. Raise the retrieval limit
- [ ] Increase the `search_store_products` `p_limit` passed by `fetchCatalogContext` from 4 to **8** (a single category like "snowboard" can have a dozen items; 4 truncates and makes the model under-report). Keep the prompt instruction to ask a clarifying question when many products match.

---

## Files to create / modify

| Action | Path | Notes |
|--------|------|-------|
| Create | `lib/catalogRetrieval.ts` | moved `CATALOG_INTENTS`, `fetchCatalogContext`, `buildCatalogSearchQuery` + helpers |
| Create | `lib/autoSend.ts` | single `canAutoSend({ autoSendEnabled, confidence, intent })` rule |
| Modify | `app/api/telegram/webhook/route.ts` | add catalog retrieval + auto-send guard + send; remove `retrievedContext: []` |
| Modify | `app/api/ai/suggest/route.ts` | import shared retrieval + `canAutoSend`; keep for manual retry only |
| Modify | `app/page.tsx` | remove inbound `/api/ai/suggest` fetch; keep manual retry |

---

## Acceptance criteria

- [ ] One inbound Telegram message triggers exactly **one** AI generation (one Queue-1 + one Queue-2 OpenAI call set), from the server.
- [ ] The auto-sent reply and the stored `ai_suggestion` are always the same object; no second divergent draft is written.
- [ ] After an auto-send, the inbox shows no draft panel and no "Show AI draft" button for that message (`autoSent: true`).
- [ ] Auto-send works with **no browser open** (verify the webhook sends server-side).
- [ ] An availability question ("do you have any snowboards?") is **never** auto-sent, even if the model returns HIGH — it's written as a draft for review.
- [ ] A safe factual HIGH case (e.g. order status) still auto-sends.
- [ ] Catalog retrieval returns up to 8 products; a query matching many products yields a clarifying-question draft, not a confident wrong answer.
- [ ] Manual "Retry AI" still works and uses the identical retrieval + auto-send rule.
- [ ] `tsc --noEmit` and `npm run lint` pass. No new `any`. `organization_id` scoping preserved on every query.

---

## Do NOT do

- ❌ Do not delete `/api/ai/suggest` — it stays for manual retry.
- ❌ Do not auto-send based on `confidence === 'high'` alone anywhere — always via `canAutoSend`.
- ❌ Do not change `suggestReply` / `preprocessMessage` internals or the confidence prompt rules in `lib/aiRouter.ts`.
- ❌ Do not change the normalised `ai_suggestion` shape consumed by the UI.
- ❌ Do not touch the retrieval SQL / migrations — only the `p_limit` value passed from `fetchCatalogContext`.
- ❌ Do not add a new realtime subscription — the existing `conversations` UPDATE sub already covers rendering.

---

## Out of scope (flag, don't build)

- pgvector semantic retrieval — separate spec (`spec-rag-pgvector-semantic.md`).
- Live inventory lookup so availability questions *can* be answered confidently — separate task.
- Any change to non-Telegram adapters (Shopify etc.) — this task is the Telegram inbound path + shared libs only.

---

## How to deliver

1. Branch `feature/consolidate-suggestion-pipeline`.
2. PR against `main`. In the description: confirm the single-generation behaviour, list the blocked-intent set used, and note the new retrieval limit.
3. No DB migration in this task. Do not merge — review first.
4. Suggest keeping `auto_send_enabled = false` on the test store until this merges.
