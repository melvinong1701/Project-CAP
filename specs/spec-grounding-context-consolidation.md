# Codex Task Spec — Consolidate the Grounding Layer + Add Order Data as a First-Class Source

**Type:** `refactor` (with one feature: order grounding)
**Priority:** `P1 – this sprint`
**Branch:** `feature/grounding-context-consolidation`

---

## Goal

The store-data grounding that the AI replies are built on (catalogue + knowledge) is the product's moat, but its assembly logic is **duplicated** across two callers and **order data is not grounded at all** — even though `order_status` is the single most common marketplace query and the data already exists. Consolidate the scattered "which sources apply → retrieve → merge → cap → order" logic into one module, and add order history as a first-class grounded source so the AI can answer order-status questions from real data instead of deflecting. This is channel-agnostic and pays off on every adapter we add next.

---

## Context — what exists today

**The grounding contract** is `RetrievedContextSnippet` (`lib/aiRouter.ts:41-45`):
```ts
export interface RetrievedContextSnippet {
  title: string
  content: string
  source?: string   // free string today: 'product_catalog' | 'knowledge_base'
}
```
It's handed to the model in `runReplyGeneration` as the "Retrieved store context" block (`lib/aiRouter.ts:431-439`), and the model echoes which source it used via `sourceCited`, validated against a list **hardcoded in the prompt**, not the type (`lib/aiRouter.ts:414`).

**The assembly is duplicated.** The exact same intent-gated retrieve-and-merge runs in two places:
- Telegram webhook (server-authoritative path): `app/api/telegram/webhook/route.ts:210-219`
- Suggest route (manual "Retry AI" path): `app/api/ai/suggest/route.ts:192-218` — same logic plus a `providedContext` override branch.

Both do: `if CATALOG_INTENTS.has(intent) → fetchCatalogContext`; `if KNOWLEDGE_INTENTS.has(intent) → fetchKnowledgeContext`; then `[...catalogContext, ...knowledgeContext]`. Retrieval primitives already live in shared libs (`lib/catalogRetrieval.ts`, `lib/knowledgeRetrieval.ts`) — it's the **orchestration around them** that's copy-pasted.

**Downstream depends on per-source counts.** The suggest route feeds `catalogContext.length` into `downgradeForAmbiguity` and `calibrateConfidence` (`app/api/ai/suggest/route.ts:234-242`). So the consolidated module must return **per-source counts**, not just a flat merged array, or it breaks calibration.

**Order data already exists and is channel-agnostic.** `customer_orders` (read pattern at `app/api/conversations/[id]/orders/route.ts:66-81`) is keyed by `organization_id` + `customer_id`, with columns: `channel, external_order_id, order_reference, status, items_summary, total_amount, currency, order_placed_at, tracking_number`. A conversation links to it via `conversations.customer_id`. It is **not Shopify-specific** — it's the normalised order store. It is **not currently fed to the AI**.

**The load-bearing coupling.** The platform guardrail (`lib/aiRouter.ts:96`) says: *"Never state specific order statuses, tracking numbers, delivery dates, or shipment details unless they appear verbatim in the conversation history provided to you."* If we retrieve order data but don't update this rule, the model will correctly **ignore** the order context. The guardrail change is in scope and is the part that makes the feature actually work.

---

## Decisions already made (do not re-litigate)

- **One module owns assembly:** `lib/grounding.ts` exposing `assembleGroundingContext(...)`. Both callers use it. Retrieval primitives stay in their existing libs — this module orchestrates them.
- **`source` becomes a typed union**, not a free string. Add `'order_history'`.
- **Order grounding is scoped to `order_status` intent only** this task. Broadening to returns/refund/dispute is a flagged follow-up, not now.
- **Order retrieval is keyed on the customer, not a search query** — there's no text to search; return the customer's recent orders.
- Keep `downgradeForAmbiguity` / `calibrateConfidence` exactly where they are — only change *what feeds them* (the new struct's counts).

---

## Scope — what to build

### 1. Type the grounding contract
- [ ] In `lib/aiRouter.ts`, add `export type RetrievedContextSource = 'product_catalog' | 'knowledge_base' | 'order_history' | 'custom_instructions'` and change `RetrievedContextSnippet.source` from `string` to `RetrievedContextSource` (still optional). Update the two existing producers (`lib/catalogRetrieval.ts`, `lib/knowledgeRetrieval.ts`) to use the union — they already emit the right string literals, this just types them.
- [ ] In the response instructions (`lib/aiRouter.ts:414`), add `"order_history"` to the allowed `sourceCited` values so the model can cite it.

### 2. Order retrieval primitive
- [ ] Create `lib/orderRetrieval.ts` exporting:
  - `export const ORDER_INTENTS = new Set<AiIntent>(['order_status'])`
  - `async function fetchOrderContext(supabase, organizationId, customerId): Promise<RetrievedContextSnippet[]>` — reads `customer_orders` (org + customer scoped, recent first, `limit 5`), maps each row to a snippet with `source: 'order_history'`. Title = `order_reference ?? external_order_id`; content = a compact line of `status`, `items_summary`, `total_amount + currency`, `tracking_number` (omit nulls). Mirror the formatting style of `fetchCatalogContext`/`fetchKnowledgeContext`.
- [ ] If `customerId` is null/absent, return `[]` (no linked customer → no order grounding).

### 3. The consolidated grounding module
- [ ] Create `lib/grounding.ts` exporting `assembleGroundingContext` with this contract:
  ```ts
  interface GroundingContext {
    snippets: RetrievedContextSnippet[]   // merged, ordered, capped at 5
    catalogMatchCount: number
    knowledgeMatchCount: number
    orderMatchCount: number
  }

  async function assembleGroundingContext(params: {
    supabase: SupabaseClient
    organizationId: string
    storeId: string | null
    customerId: string | null
    preprocessing: PreprocessingResult
    latestMessage: string
    history: ConversationContextMessage[]
    providedContext?: RetrievedContextSnippet[]   // override: if non-empty, short-circuit and return it as snippets
  }): Promise<GroundingContext>
  ```
- [ ] Behaviour: if `providedContext?.length`, return it as `snippets` with counts derived from `source` (so calibration still sees `catalogMatchCount`). Otherwise: run catalog retrieval iff `CATALOG_INTENTS.has(intent)` && `storeId`; knowledge iff `KNOWLEDGE_INTENTS.has(intent)` && `storeId`; order iff `ORDER_INTENTS.has(intent)` && `customerId`. Merge in a fixed order — **order_history first, then product_catalog, then knowledge_base** (order data is the most specific/authoritative for order_status). Cap merged snippets at 5 (the model already only reads `.slice(0, 5)` — do the cap here so counts and what-the-model-sees agree).
- [ ] This module is the **only** place the source-by-intent decision lives.

### 4. Swap both callers to the module
- [ ] `app/api/telegram/webhook/route.ts`: replace the inline block (`:210-219`) with one `assembleGroundingContext(...)` call. Pass `customer_id` (add it to the conversation select if not already fetched). Feed `result.snippets` as `retrievedContext`; feed the counts wherever the webhook needs them.
- [ ] `app/api/ai/suggest/route.ts`: replace the inline block (`:192-218`) with one `assembleGroundingContext(...)` call, passing `body.retrievedContext` as `providedContext`. Use `result.catalogMatchCount` for `downgradeForAmbiguity` / `calibrateConfidence` (replacing `catalogContext.length`). Add `customer_id` to the conversation select (`:124`, currently `id, store_id, channel, sender_name, last_message`).

### 5. Update the guardrail so order grounding is usable (load-bearing)
- [ ] In `lib/aiRouter.ts` `PLATFORM_GUARDRAILS` (`:96`), change the order-data rule to permit stating order status/tracking/shipment details when they appear **either in conversation history or in the retrieved order context (`source: order_history`)** — and only as shown there, no fabrication/estimation/inference. Keep every other absolute rule unchanged.
- [ ] Confirm the existing confidence rule still forbids HIGH for availability/stock/pricing without inventory data (`:127`) — do not weaken it; order grounding is unrelated to inventory.

---

## Files to create / modify

| Action | Path | Notes |
|--------|------|-------|
| Create | `lib/orderRetrieval.ts` | `ORDER_INTENTS`, `fetchOrderContext` (customer-keyed, source `order_history`) |
| Create | `lib/grounding.ts` | `assembleGroundingContext` — single source-by-intent orchestrator; returns snippets + per-source counts |
| Modify | `lib/aiRouter.ts` | `RetrievedContextSource` union; type `source`; add `order_history` to `sourceCited`; guardrail order-data rule |
| Modify | `lib/catalogRetrieval.ts` | type `source` literal to the union (no behaviour change) |
| Modify | `lib/knowledgeRetrieval.ts` | type `source` literal to the union (no behaviour change) |
| Modify | `app/api/telegram/webhook/route.ts` | swap inline assembly → `assembleGroundingContext`; ensure `customer_id` available |
| Modify | `app/api/ai/suggest/route.ts` | swap inline assembly → `assembleGroundingContext`; feed counts to calibration; add `customer_id` to select |

---

## Acceptance criteria

- [ ] The intent→source→retrieve→merge decision exists in exactly **one** place (`lib/grounding.ts`); neither the webhook nor the suggest route contains its own copy.
- [ ] Both callers produce identical grounding for the same conversation (manual "Retry AI" and automatic webhook agree).
- [ ] An `order_status` question on a conversation **with a linked customer that has orders** retrieves order rows, and the model can state the actual status/tracking from that context (verify the reply reflects real `customer_orders` data, not a deflection).
- [ ] An `order_status` question on a conversation with **no linked customer** retrieves no order rows and the model does **not** fabricate a status (stays MEDIUM/LOW, escalates).
- [ ] `downgradeForAmbiguity` and `calibrateConfidence` receive the catalog match count from the new struct and behave exactly as before for catalog/knowledge cases (no calibration regression).
- [ ] `RetrievedContextSnippet.source` is the typed union everywhere; `sourceCited` may now be `order_history`.
- [ ] Merged grounding is capped at 5 snippets, ordered order_history → product_catalog → knowledge_base.
- [ ] `tsc --noEmit` and `npm run lint` pass. No new `any`. Every new query is scoped by `organization_id` (and `customer_id` for orders).

---

## Do NOT do

- ❌ Do not change retrieval SQL / RPCs / migrations (`search_store_products`, `search_store_knowledge`). Order retrieval is a plain `customer_orders` select — no new RPC.
- ❌ Do not broaden order grounding beyond `order_status` intent this task. Returns/refund/dispute order context is a flagged follow-up.
- ❌ Do not touch `downgradeForAmbiguity` / `calibrateConfidence` / `canAutoSend` internals — only what feeds them.
- ❌ Do not change the normalised `ai_suggestion` shape the UI consumes.
- ❌ Do not weaken any other absolute guardrail while editing the order-data rule. Surgical change to that one rule only.
- ❌ Do not add new dependencies.
- ❌ Do not add channel-specific branching in `lib/grounding.ts` — it operates on the normalised conversation/customer, not on `channel`.

---

## Out of scope (flag in summary, don't build)

- Live inventory lookup so availability/pricing can be answered confidently — separate task.
- Order grounding for returns/refund/dispute/shipping intents — follow-up once order_status is proven.
- pgvector semantic retrieval — `spec-rag-pgvector-semantic.md`.
- The seam-1 work (typed `PlatformAdapter` interface, inbound media/attachment field, normalised order-status enum) — separate spec; this task is the grounding seam only.

---

## How to deliver

1. Branch `feature/grounding-context-consolidation`.
2. PR against `main`. In the description: confirm assembly lives in one module, state the source merge order and cap, and note the guardrail wording change verbatim so it can be reviewed.
3. No DB migration in this task.
4. Behavioural AI verification (order-status answered from real data) must be done on a Vercel preview with `OPENAI_API_KEY` set — it cannot be verified locally (no key in `.env.local`). Note this in the PR.
5. Do not merge — review first.
