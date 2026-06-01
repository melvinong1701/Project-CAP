# Codex Task Spec — Retrieval Precision (AND-first tsquery tiering)

**Type:** `fix`
**Priority:** `P1 – this sprint` (the ambiguity guard currently downgrades almost every catalog query because retrieval over-returns)
**Branch:** `feature/retrieval-precision-and-first`
**Base:** `main` (after `feature/suggestion-quality-fixes` is merged).

---

## Goal

Catalog retrieval uses an OR-based `tsquery`, so a single shared category word ("snowboard") matches every snowboard in the store. Live check: "complete snowboard", "videographer snowboard", and "complete snowboard colours" each return 8 rows (the limit) even though only one product is meant. This breaks the new ambiguity guard (`downgradeForAmbiguity`, threshold 5), which then downgrades *precise* single-product queries to MEDIUM and blocks them from auto-sending — defeating auto-send for the whole product category.

Fix retrieval so a precise multi-term query returns few rows and a genuinely broad query returns many. Do this by trying an **AND** match first, falling back to **OR**, then to the existing **trigram** fuzzy tier. This makes row-count a meaningful ambiguity signal again — no app-code change needed; the existing count-based downgrade will then only fire on genuinely broad queries.

---

## Context

- `search_store_products` (current def: migration `20260530000001_fix_search_store_products_word_sim_operand.sql`) builds an OR `tsquery` from the stemmed lexemes of `p_query` (`string_agg(quote_literal(lexeme), ' | ')`), matches `search_vector @@ tsquery` ranked by `ts_rank`, then falls back to `pg_trgm` word-similarity (`search_text %> p_query`) when FTS returns zero rows. Limit 8.
- `p_query` is built upstream by `buildCatalogSearchQuery` from `preprocessing.tags` (distinctive terms; generic words like colours/sizes already filtered), falling back to the raw latest message when there are no tags.
- The ambiguity guard (`lib/autoSend.ts` → `downgradeForAmbiguity`) downgrades HIGH→MEDIUM when a catalog-intent query returns ≥5 rows. It consumes `catalogContext.length`. **Do not change it** — this task makes its input meaningful.

---

## Scope — what to build

Single migration replacing the body of `search_store_products` with three-tier matching. Same signature, same return shape, same limit param.

- [ ] **Tier 1 — AND (precise):** build an AND `tsquery` from the input lexemes (`string_agg(quote_literal(lexeme), ' & ')`). Run the existing `search_vector @@ tsquery` select ranked by `ts_rank desc`, limit. If it returns ≥1 row, return those and stop.
- [ ] **Tier 2 — OR (recall):** only if Tier 1 returned zero rows, build an OR `tsquery` (`' | '`) and run the same select. If ≥1 row, return and stop. (This is the current behaviour, now demoted to a fallback.)
- [ ] **Tier 3 — trigram (fuzzy):** only if Tier 2 also returned zero rows, run the existing `pg_trgm` word-similarity fallback (`sp.search_text %> v_clean_query` + `word_similarity(v_clean_query, sp.search_text) >= 0.3`, ordered by `word_similarity desc`). Unchanged from today.
- [ ] Preserve everything else: `organization_id` + `store_id` scoping in every tier, `set_config('pg_trgm.word_similarity_threshold', '0.3', true)`, the empty-query guard, `stable`, `set search_path = public, extensions, pg_temp`.
- [ ] **Exclude non-active products in every tier.** Customers must never be shown DRAFT or ARCHIVED listings. Add `and lower(sp.status) = 'active'` to the WHERE clause of all three tiers (status is stored upper-case, e.g. `ACTIVE`). Verified leak: a "snowbaord" query currently returns "The Draft Snowboard" (DRAFT) and "The Archived Snowboard" (ARCHIVED).

Build both tsqueries from the same `to_tsvector('english', v_clean_query)` lexeme set; only the join operator differs. Use `get diagnostics … = row_count` after each tier to decide whether to fall through, matching the existing pattern.

---

## Files to create / modify

| Action | Path | Notes |
|--------|------|-------|
| Create | `supabase/migrations/<timestamp>_search_store_products_and_first.sql` | `create or replace function search_store_products(...)` with AND→OR→trigram tiers |

No application/TypeScript changes.

---

## Acceptance criteria (verify against the live test store)

- [ ] "videographer snowboard" returns **1** row (AND tier) — was 8.
- [ ] "complete snowboard" returns **1** row (The Complete Snowboard).
- [ ] "snowboard" (single token) still returns many (AND == OR for one lexeme) — correctly ambiguous.
- [ ] DRAFT and ARCHIVED products never appear in any result ("The Draft Snowboard" / "The Archived Snowboard" are excluded).
- [ ] A typo'd single-product query ("videographer snowbaord") still resolves via the trigram tier (AND and OR both miss the typo → fall through).
- [ ] Existing typo behaviour from prior work is unchanged ("snowbaord" alone still returns snowboards via trigram).
- [ ] Return shape unchanged; `org_id` + `store_id` scoping intact in all three tiers.
- [ ] Net effect with the existing guard: precise catalog queries (1-2 rows) auto-send when HIGH; broad queries (≥5 rows) still downgrade to MEDIUM.

---

## Do NOT do

- ❌ Do not change `downgradeForAmbiguity`, the threshold, or any app code.
- ❌ Do not merge the three tiers into one query — they are strict fallbacks (AND only if it has rows, etc.).
- ❌ Do not change the limit (8), the trigram threshold (0.3), or `search_text` / `search_vector` definitions.
- ❌ Do not apply the migration to the linked Supabase DB — flag it for review; it will be applied separately.

---

## How to deliver

1. Branch `feature/retrieval-precision-and-first` off `main`.
2. PR against `main`. In the description, paste the row-count results for the four acceptance queries above.
3. Do not apply the migration or merge — review first.
