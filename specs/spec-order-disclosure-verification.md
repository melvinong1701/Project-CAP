# Codex Spec — Identity-gated order disclosure (Telegram MVP)

## Problem

The AI now correctly grounds order-status replies in the customer's real orders
(`sourceCited: order_history`). But on Telegram the link between the chat and the
order history is **fuzzy** — `linkTelegramCustomer` binds by `telegram_id`, and the
orders are attached only because identity-resolution merged the customer with a
Shopify profile by phone/email. Phone is a fragile, recyclable anchor:

- Customer changes number → new chat → looks like a stranger (fails **safe**).
- Telco recycles the old number to someone else → that person could inherit the
  original customer's order history (fails **open** — a PDPA-relevant disclosure of
  another person's data).

**We must not treat phone/Telegram linkage as authorization to disclose order data.**
Instead, gate disclosure on the customer demonstrating knowledge of the order.

## Goal

Before the AI discloses any order-specific detail (status, "has it shipped", tracking)
on Telegram, the relevant order must be **disclosable**. An order among the customer's
linked orders is disclosable when **either**:

1. **Recency path** — the customer mentioned that order's identifier (order reference or
   external order id) in a customer-sent message within the recent conversation window;
   **or**
2. **Postcode path** — the customer provided, in a customer-sent message, a postal code
   matching that order's shipping postcode (used to identify + verify the order when no
   order number is in play). A postcode-verified order is persisted (sticky).

All matching is **deterministic code** — never the LLM. The model only ever sees orders
that code has marked disclosable. If the customer asks about an order and none is
disclosable, the AI asks for the order number **or** the postcode and discloses nothing.

Order **count is irrelevant** to this rule — it only affects disambiguation wording.

### Accepted risk (product decision, 2026-06-04)
The recency path lets an order number alone unlock disclosure. Because order numbers are
guessable/sequential (e.g. #1002/#1003/#1004) and the Telegram binding is phone-derived
(recyclable), this reopens the recycled-number gap. **Accepted for MVP** in favour of
lower friction. Optional mitigations (NOT in scope unless later requested): require the
postcode path specifically for disclosing raw tracking numbers; or require a postcode
match at least once per conversation before any disclosure.

## Scope

**In scope (MVP):**
- Telegram channel only.
- Tier-1 disclosure only: order status / shipped-or-not / tracking for a *disclosable* order.
- Matching against the customer's **already-linked** orders (`customer_orders` for the
  conversation's `customer_id`).

**Out of scope (note in code comments / follow-up, do NOT build):**
- Org-wide order lookup + auto-relink to recover the "customer changed number" case
  (Phase 2 — also needs brute-force/attempt limiting).
- Brute-force attempt caps (Phase 2; flag the risk for MY 5-digit, town-level postcodes).
- WhatsApp / marketplace channels (marketplace chat is platform-authenticated; a later
  spec can mark those as pre-verified and skip the challenge).
- Tier-2 disclosures (address changes, refunds, personal data) — these already escalate
  to a human via existing guardrails; leave that path unchanged.
- The optional mitigations listed under "Accepted risk" above.

---

## Design

### Trust model
- The **disclosure decision is code, not the model.** Regex/token-match candidate
  identifiers and postcodes against the customer's own orders; the LLM only sees orders
  code has marked disclosable.
- The challenge must be **open-ended** ("what's the order number, or the postcode on the
  order?"). The model must never state a candidate value back (no "is it 120304?"),
  because that leaks the answer.

### Disclosability rule
For each order `O` in the customer's linked orders, `O` is **disclosable** for a
conversation when EITHER:

- **(a) Recency** — a token matching `O.order_reference` (with or without a leading `#`)
  or `O.external_order_id` appears in a **customer-sent** message within the recent
  window (the last 10 messages already loaded by the pipeline). Window-based, not sticky.
- **(b) Postcode** — `O` is in `conversations.verified_order_ids`, set when a customer
  message contained a postcode matching `O`'s shipping postcode
  (`raw_payload -> shipping_address -> zip`, normalised). Sticky.

`disclosableOrderIds = (recency matches) ∪ verified_order_ids`.

Notes:
- A postcode may match multiple of the customer's orders (same address / repeat buyer) —
  verify all of them; they all belong to the customer. The AI can then disambiguate
  conversationally.
- If `O` has no postcode in `raw_payload`, the postcode path is unavailable for it; the
  recency path still applies.

---

## Changes

### 1. Migration — verification state on the conversation

Create via `supabase migration new add_verified_order_ids` (let CI apply it; do **not**
use the dashboard/MCP `apply_migration` — see CONTEXT.md migration note):

```sql
alter table public.conversations
  add column if not exists verified_order_ids uuid[] not null default '{}';
```

No RLS change needed — existing per-row org policies on `conversations` already cover it.

### 2. New `lib/orderVerification.ts`

Pure, deterministic. No OpenAI calls.

```ts
type OrderForMatch = {
  id: string
  order_reference: string | null
  external_order_id: string
  raw_payload: unknown
}

// Extract the shipping postcode from a Shopify-shaped raw_payload. null if absent.
export function postcodeFromOrder(rawPayload: unknown): string | null

// Normalise a postcode for comparison (trim, remove spaces, uppercase).
export function normalisePostcode(value: string): string

// (Recency path) ids of orders whose order_reference/external_order_id appears in any of
// the given recent CUSTOMER-sent messages. Match order_reference with and without '#'.
export function ordersMentionedByCustomer(params: {
  customerMessages: string[]
  orders: OrderForMatch[]
}): string[]

// (Postcode path) ids of orders whose shipping postcode appears in the given message.
// Pure — caller persists results into verified_order_ids.
export function ordersVerifiedByPostcode(params: {
  message: string
  orders: OrderForMatch[]
}): string[]
```

Implementer notes:
- Postcode token must be length ≥ 4 to avoid matching stray digits; skip rather than
  weaken if a country uses shorter codes.
- Only consider **customer-sent** messages for the recency path — never agent/AI turns
  (otherwise a value the AI printed could be parroted back by anyone).
- Do not parse arbitrary order-number formats; only check against the customer's own
  known identifiers.

### 3. Pipeline — compute disclosable orders on inbound, then gate grounding

**`app/api/telegram/webhook/route.ts` (`triggerAiSuggestion`):**
- After resolving `customerId`, fetch the customer's linked orders
  (`id, order_reference, external_order_id, raw_payload`, org+customer scoped).
- `ordersVerifiedByPostcode` on the **latest inbound customer message** → union into
  `conversations.verified_order_ids` (persist).
- `ordersMentionedByCustomer` over the recent customer-sent messages in `history`.
- `disclosableOrderIds = verified_order_ids ∪ mentioned` → pass into grounding.

**`lib/grounding.ts` + `lib/orderRetrieval.ts`:**
- `assembleGroundingContext` gains a `disclosableOrderIds: string[]` param.
- `fetchOrderContext` returns order snippets **only for orders whose id is in
  `disclosableOrderIds`**. Other orders contribute nothing.
- Net effect: `orderMatchCount > 0` ⇒ at least one disclosable order is in context.

**`app/api/ai/suggest/route.ts`** (agent-triggered re-draft): read the existing
`verified_order_ids` and recompute recency matches over the loaded history, pass through
`disclosableOrderIds`. It does **not** add new postcode verifications (only inbound
webhooks do).

### 4. Guardrail — `lib/aiRouter.ts` `PLATFORM_GUARDRAILS`

Replace the current order-data rule with disclosability language:

- Only disclose order status, shipment state, or tracking for an order whose details
  appear in the retrieved `order_history` context (which now contains **only disclosable
  orders**).
- If no `order_history` context is present and the customer is asking about an order,
  reply by asking them to provide **their order number, or the postal code on the
  order**, in one message. Do not confirm or deny any order detail, and do not reveal,
  guess, or echo any candidate order number or postcode. Ask as an open question.
- Never list or hint at the customer's orders when none are disclosable.

### 5. Confidence (default; flag as tunable)
- The disclosure-request reply ("send your order number or postcode") is a safe
  clarifying question → **MEDIUM** (drafted for agent review), not LOW/human-only.
- Disclosure replies for a disclosable order follow existing confidence logic.
- (Open product decision, do not resolve here: whether the request may auto-send once
  auto-send leaves shadow mode.)

---

## Success criteria

1. `tsc --noEmit` + ESLint clean.
2. Migration file exists under `supabase/migrations/`; applied via CI merge, not by hand.
3. Unit tests on `lib/orderVerification.ts`:
   - customer message mentions a real order ref → that order disclosable (recency);
   - postcode matching a real order → that order id returned, persists to verified set;
   - postcode-only, no ref, with a non-matching postcode → nothing disclosable;
   - order ref appears only in an AGENT/AI message, never customer → not disclosable;
   - guessed/sequential ref for an order the customer does NOT own → not disclosable.
4. Behavioural (Telegram, on a Vercel deploy with `OPENAI_API_KEY`):
   - "Where's my order? Has it shipped?" with no order number/postcode in chat → AI asks
     for order number or postcode, discloses nothing.
   - Customer then sends a real order number → AI states that order's status/shipment.
   - Customer instead sends a matching postcode → that order id lands in
     `verified_order_ids` and the AI discloses it.
   - Customer sends a postcode that matches none of their orders → no disclosure.

## What not to do
- Do not let the model decide disclosability or echo candidate values.
- Do not disclose for non-disclosable orders, even when linked.
- Do not build org-wide lookup, relink, attempt-caps, the optional mitigations, or
  non-Telegram channels (Phase 2).
- Do not touch the Tier-2 escalation paths (refund/dispute/abuse) — unchanged.
- Do not apply the migration via the Supabase dashboard/MCP.
