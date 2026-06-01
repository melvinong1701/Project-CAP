# Codex Task Spec — Answer Quality (drop status jargon, stock-based phrasing, clarifying questions)

**Type:** `fix`
**Priority:** `P1 – this sprint`
**Branch:** `feature/answer-quality-wording`
**Base:** `main` (independent of the retrieval-precision migration; can land in parallel).

---

## Goal

Live testing shows three wording/quality problems in AI replies for catalog queries:

1. Replies say "the active ones are …" — leaking Shopify's internal product *status* ("active"). "Active" means the listing is published, NOT that the item is in stock; it is both jargon and slightly wrong.
2. Availability is described from product status rather than from real stock data (`variant.availableForSale`), which we already retrieve.
3. When several products match a broad query, the reply enumerates a partial list instead of asking a short clarifying question.

Fix the snippet we feed the model and the reply prompt so answers read naturally, base availability on stock, and ask to narrow down when the query is ambiguous.

---

## Context

- `lib/catalogRetrieval.ts` → `fetchCatalogContext` builds each product's snippet `content`. It currently includes a `Status: ${product.status}` line (values like `ACTIVE`, `DRAFT`, `ARCHIVED`) and variant lines that already carry `(unavailable)` derived from `variant.availableForSale`.
- `lib/aiRouter.ts` holds `PLATFORM_GUARDRAILS`. It already instructs: ask a clarifying question on multiple matches and set MEDIUM. The model is not following it cleanly — it enumerates and still self-rates HIGH.
- The retrieval-precision spec (`spec-retrieval-precision-and-first.md`) is separately excluding DRAFT/ARCHIVED products at the SQL layer. This task is the wording/prompt layer and must not duplicate that filter.

---

## Scope — what to build

### 1. Stop surfacing raw product status to the model
- [ ] In `fetchCatalogContext` (`lib/catalogRetrieval.ts`), remove the `Status: ${product.status}` line from the customer-facing snippet `content`. Product lifecycle status is not customer-facing and is the source of the "active ones" phrasing.
- [ ] Keep the variant `(unavailable)` flagging (from `availableForSale`) — that is the correct availability signal.

### 2. Make availability language stock-based
- [ ] In `PLATFORM_GUARDRAILS` (`lib/aiRouter.ts`), add a short rule: when describing availability, base it on the per-variant availability provided in the catalog context (in-stock vs unavailable), and use natural customer language ("we currently have …", "in stock", "currently unavailable"). Do not use internal terms like "active", "draft", or "status".
- [ ] Do not weaken the existing rule that availability/stock claims without inventory data must be MEDIUM/LOW.

### 3. Clarifying question on multiple matches
- [ ] Strengthen the existing multi-match rule in `PLATFORM_GUARDRAILS` so that when the catalog context contains several plausible products, the reply is a brief clarifying question that names a couple of examples and asks the customer to specify — NOT a full enumeration — and is set to MEDIUM. Example shape: "We carry a few snowboards — are you after a particular model, or want me to suggest some?" Keep it to 1-2 sentences.
- [ ] This is prompt-only; do not add code branching for it. (The deterministic ≥5 downgrade guard from `lib/autoSend.ts` stays as the hard backstop.)

---

## Files to modify

| Action | Path | Notes |
|--------|------|-------|
| Modify | `lib/catalogRetrieval.ts` | remove `Status:` line from snippet content |
| Modify | `lib/aiRouter.ts` | availability-from-stock rule + stronger clarifying-question rule in `PLATFORM_GUARDRAILS` |

---

## Acceptance criteria

- [ ] No reply uses the words "active", "draft", or "archived" to describe products; availability is phrased naturally ("in stock", "currently unavailable", "we currently have …").
- [ ] An unavailable variant is still correctly described as unavailable (driven by `availableForSale`, not status).
- [ ] A broad query ("do you have any snowboards?") yields a short clarifying question, not a list of 4+ product names.
- [ ] A specific in-stock product query still gets a direct factual answer.
- [ ] `tsc --noEmit` and `npm run lint` pass. No new `any`.

---

## Do NOT do

- ❌ Do not add or change the DRAFT/ARCHIVED SQL filter — that lives in `spec-retrieval-precision-and-first.md`.
- ❌ Do not change `downgradeForAmbiguity`, `canAutoSend`, or the confidence thresholds.
- ❌ Do not change retrieval SQL or migrations.
- ❌ Do not remove the `availableForSale` `(unavailable)` flagging from the snippet.

---

## How to deliver

1. Branch `feature/answer-quality-wording` off `main`.
2. PR against `main`. In the description, paste 2-3 example replies (broad query, specific in-stock, specific unavailable) showing the new wording.
3. No DB migration. Do not merge — review first.
