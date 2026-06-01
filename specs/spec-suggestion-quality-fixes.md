# Codex Task Spec — Suggestion Quality Fixes (ambiguity guard, Default Title, stale draft flash)

**Type:** `fix`
**Priority:** `P1 – this sprint` (#1 still auto-sends confident partial answers to customers)
**Branch:** `feature/suggestion-quality-fixes`
**Base:** branches off `feature/consolidate-suggestion-pipeline` (or `main` after that merges). Assumes `lib/autoSend.ts`, `lib/catalogRetrieval.ts`, and the consolidated webhook/suggest routes from that work exist.

---

## Goal

Three issues observed in live testing after the pipeline consolidation:

1. **Broad catalog queries auto-send a confident partial list.** "Do you have any snowboards?" (13 active products) was classified `product_question` — not `availability`, so the intent guard didn't block it — and the model self-rated HIGH and enumerated 4 of them, then auto-sent. Broad queries should be held for review with a clarifying question, never auto-sent as a partial enumeration.
2. **"Default Title" leaks to customers.** Single-variant Shopify products carry one variant literally named `"Default Title"`. The reply surfaced "the Default Title variant" — an internal artifact, not customer-facing language.
3. **Stale suggestion flashes before the new one.** When a new customer message arrives, the UI briefly re-renders the *previous* turn's stored `ai_suggestion` until the webhook finishes generating (~2-4s), then it flips. Confusing.

---

## Context

- `lib/autoSend.ts` holds `canAutoSend({ autoSendEnabled, confidence, intent })` and `BLOCKED_AUTO_SEND_INTENTS`.
- `lib/catalogRetrieval.ts` holds `CATALOG_INTENTS`, `fetchCatalogContext` (returns `RetrievedContextSnippet[]`, limit 8), and `buildCatalogSearchQuery`. The variant string is built in `fetchCatalogContext`'s `variantSummary`.
- Both `app/api/telegram/webhook/route.ts` (`triggerAiSuggestion`) and `app/api/ai/suggest/route.ts` run: preprocess → catalog retrieval → `suggestReply` → `canAutoSend` → write `ai_suggestion`. The webhook also sends server-side and writes the authoritative `autoSent`.
- The model already has a prompt rule to ask a clarifying question on multiple matches, but it is not honoring it reliably — so #1 must be enforced in code, not prompt.

---

## Scope — what to build

### 1. Deterministic ambiguity guard (server-side confidence downgrade)
- [ ] In `lib/autoSend.ts`, add `export const CATALOG_AMBIGUITY_THRESHOLD = 5` and a pure function:
  ```ts
  downgradeForAmbiguity(confidence: AiConfidence, catalogMatchCount: number, intent: AiIntent): AiConfidence
  ```
  Returns `'medium'` when `confidence === 'high'` AND `CATALOG_INTENTS.has(intent)` AND `catalogMatchCount >= CATALOG_AMBIGUITY_THRESHOLD`; otherwise returns `confidence` unchanged. (Import `CATALOG_INTENTS` from `lib/catalogRetrieval.ts` — no circular dependency, that module does not import `autoSend`.)
- [ ] In **both** the webhook and the suggest route, after `suggestReply` returns, compute:
  ```ts
  const effectiveConfidence = downgradeForAmbiguity(result.confidence, catalogContext.length, preprocessing.intent)
  ```
  Use `effectiveConfidence` for BOTH the stored `ai_suggestion.confidence` AND the `canAutoSend` call. Do not mutate `result`; derive a local value.
- [ ] Net effect: a broad query returning ≥5 catalog matches is written as MEDIUM and therefore never auto-sends — it becomes a review draft. Specific queries (1-2 matches) are unaffected and can still auto-send.

### 2. Suppress "Default Title" in the variant summary
- [ ] In `fetchCatalogContext` (`lib/catalogRetrieval.ts`), treat a variant whose `title` equals `"Default Title"` (case-insensitive, trimmed) as unnamed:
  - If a product has exactly one variant and it is "Default Title": render the price only (e.g. `Price: 885.95`, plus `(unavailable)` when `availableForSale` is false) — no variant name.
  - If "Default Title" somehow appears among multiple variants, omit just that variant's name and show its price.
- [ ] Keep the existing `(unavailable)` flagging behaviour intact for all other variants.

### 3. Clear the stale suggestion when a new customer message arrives
- [ ] In `app/api/telegram/webhook/route.ts`, at the start of `triggerAiSuggestion` (before preprocessing/generation, once it's established this customer message will get a suggestion), write `ai_suggestion: null` to the conversation row so the UI clears the previous turn's draft immediately. The final suggestion overwrites it when generation completes.
- [ ] If generation fails, the existing catch block already writes an error suggestion — leave that path as-is.
- [ ] Do NOT change the client; the existing `conversations` UPDATE realtime subscription will render the cleared then final state. (No new subscription.)

---

## Files to modify

| Action | Path | Notes |
|--------|------|-------|
| Modify | `lib/autoSend.ts` | `CATALOG_AMBIGUITY_THRESHOLD` + `downgradeForAmbiguity` |
| Modify | `lib/catalogRetrieval.ts` | "Default Title" suppression in `variantSummary` |
| Modify | `app/api/telegram/webhook/route.ts` | null-first clear; apply `effectiveConfidence` to store + `canAutoSend` |
| Modify | `app/api/ai/suggest/route.ts` | apply `effectiveConfidence` to store + `canAutoSend` |

---

## Acceptance criteria

- [ ] "Do you have any snowboards?" (≥5 catalog matches) is written as MEDIUM and **not** auto-sent — it appears as a review draft, even with `auto_send_enabled = true`.
- [ ] A specific query with 1-2 matches (e.g. "what colours does the complete snowboard come in?") still auto-sends when HIGH — no regression.
- [ ] The stored `ai_suggestion.confidence` reflects the downgrade (UI shows MEDIUM), not the model's original HIGH.
- [ ] A single-"Default Title"-variant product renders as a price with no "Default Title" text in the reply context.
- [ ] After sending a message, the previous turn's draft does not flash on the next inbound message — the suggestion clears, then the new one appears.
- [ ] `downgradeForAmbiguity` is a pure function with no side effects; threshold is a named constant.
- [ ] `tsc --noEmit` and `npm run lint` pass. No new `any`. `organization_id` scoping preserved on the null-first write.

---

## Do NOT do

- ❌ Do not add `product_question` to `BLOCKED_AUTO_SEND_INTENTS` — the ambiguity guard handles the broad-query case without killing legitimate single-product auto-sends.
- ❌ Do not change `lib/aiRouter.ts` prompts or confidence rules.
- ❌ Do not re-generate the reply after downgrading — downgrade confidence only; the agent reviews/edits the drafted text.
- ❌ Do not change retrieval SQL, the limit (8), or migrations.
- ❌ Do not add a new realtime subscription or change the `ai_suggestion` shape.
- ❌ Do not mutate the `result` object from `suggestReply` — use a derived local `effectiveConfidence`.

---

## Out of scope (flag, don't build)

- Regenerating a proper clarifying-question reply text for ambiguous queries (instead of just downgrading) — a later enhancement once we decide on prompt vs. templated phrasing.
- A "generating…" spinner state in place of the cleared draft — UI task, separate.
- Live inventory / status filtering of which products count as "available" — separate task.

---

## How to deliver

1. Branch `feature/suggestion-quality-fixes` off the consolidation branch (or `main` if merged).
2. PR against `main`. In the description: confirm the ambiguity threshold used, the "Default Title" rendering, and the null-first clear.
3. No DB migration. Do not merge — review first.
