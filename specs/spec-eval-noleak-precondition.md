# Codex Task Spec — Harden No-Leak Eval Cases with an Existence Precondition

**Type:** `build`
**Priority:** `P2 – small follow-up`
**Branch:** `feature/retrieval-eval-harness` (fold into the existing, not-yet-merged eval PR — do this before committing/opening that PR)

---

## Goal

Make the active-only "no-leak" retrieval cases fail loudly if the inactive products they rely on stop existing. Today those cases pass as long as the Draft/Archived title is **absent** from results — which is the right assertion, but it also passes for the wrong reason if someone deletes those rows from the store. Add a precondition that asserts each forbidden product actually exists **and is non-active** before trusting the no-leak result.

---

## Context

- The eval harness is `scripts/eval-retrieval.ts` + `scripts/eval-retrieval.fixtures.ts` (built this sprint; reuses production `buildCatalogSearchQuery` + `fetchCatalogContext`, `p_limit: 8`, RPC `search_store_products`).
- No-leak cases are identified by `expectedProductTitle === null` **and** a set `forbiddenProductTitle` (currently "The Draft Snowboard" and "The Archived Snowboard"). `scoreCase()` returns a hit for these when the forbidden title is **not** in the returned titles.
- The RPC filters `lower(status) = 'active'`, so Draft/Archived rows are correctly excluded. Verified 2026-06-01: both rows exist (status DRAFT / ARCHIVED) and their exact titles match their case queries — so the filter is what's being exercised.
- **The gap:** if those two rows are ever deleted (or flipped to ACTIVE — in which case retrieval *would* leak), the no-leak case still returns "absent" and silently passes. The test would give false confidence in the active-only filter.
- The eval already holds a service-role admin client (`createSupabaseAdminClient()`), so it can read `store_products` directly, scoped by org + store.

---

## Scope — what to build

- [ ] For each case with a `forbiddenProductTitle`, before (or alongside) scoring, query `store_products` directly for a row matching that title within the same `organization_id` + `store_id`, and assert it exists with `lower(status) <> 'active'`.
- [ ] If the precondition is **not** met (row missing, or row is active), treat the case as a failure with a distinct, explicit message — e.g. `PRECONDITION FAILED: '<title>' must exist as a non-active product to validate no-leak`. Do **not** let it score as a silent PASS.
- [ ] Surface precondition failures distinctly from retrieval misses in the output and in the exit behaviour: a precondition failure must force a non-zero exit regardless of the overall hit-rate floor (it's a test-integrity problem, not a retrieval regression). Make the distinction visible in the per-case line and the summary.
- [ ] Do the existence checks with a single batched read where practical (one query for all forbidden titles), not one round-trip per case, to keep the eval fast.

---

## Files to create / modify

| Action | Path | Notes |
|--------|------|-------|
| Modify | `scripts/eval-retrieval.ts` | Add the precondition read + distinct failure path + non-zero exit on precondition failure |
| Modify | `scripts/eval-retrieval.fixtures.ts` | Only if a fixture-level field is needed; the `forbiddenProductTitle` marker already identifies these cases, so prefer no schema change |

---

## Acceptance criteria

- [ ] With the Draft and Archived rows present and inactive (current state), the eval still reports 14/14 and exits zero.
- [ ] If a forbidden product is deleted or set to ACTIVE, the corresponding case reports a clearly-labelled PRECONDITION FAILED line and the run exits non-zero — it does **not** pass silently. (Demonstrate with a temporary local check or a documented manual verification in the PR; do not mutate the live store permanently.)
- [ ] Precondition failures are visually distinct from ordinary retrieval FAILs in the output.
- [ ] No new dependencies. `organization_id` + `store_id` scoping passed through to the existence read. No new `any` types.
- [ ] `tsc --noEmit` passes; `npm run lint` passes.

---

## Do NOT do

- ❌ Do not modify `search_store_products`, `fetchCatalogContext`, or `buildCatalogSearchQuery` — this only touches the eval harness.
- ❌ Do not permanently mutate the live store's products to test the failure path — use a temporary/local check and revert, or describe the manual verification in the PR.
- ❌ Do not change the scoring of positive or negative (zero-row) cases — only the forbidden-title no-leak cases gain a precondition.
- ❌ Do not add CI wiring (still a later step).

---

## How to deliver

1. Continue on `feature/retrieval-eval-harness` (the eval work is still uncommitted/un-merged — this folds into the same PR).
2. In the PR description, note that no-leak cases now assert the inactive row exists, and how you verified the failure path.
3. Do not merge — review first.
