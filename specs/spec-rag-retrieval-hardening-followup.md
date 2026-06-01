# Codex Follow-up — Fix fuzzy fallback (PR #7) to use word similarity

**Type:** `fix`
**Priority:** `P1 – this sprint`
**Branch:** continue on `feature/rag-retrieval-hardening` (amend PR #7, do not open a new PR)

---

## Problem

PR #7's trigram fallback uses full-string similarity:

```sql
and sp.search_text % v_clean_query
and similarity(sp.search_text, v_clean_query) >= v_trgm_threshold
order by similarity(sp.search_text, v_clean_query) desc
```

`similarity()` divides shared trigrams by the **union** of trigrams across both whole strings, so a short query is always penalised against the long concatenated `search_text` (title + product_type + tags + variant titles). Measured against a realistic product string:

```
'snowbaord'      full similarity ≈ 0.086   word similarity ≈ 0.43
'blu snowboard'  full similarity ≈ 0.194   word similarity ≈ 0.71
'snowboard'      full similarity ≈ 0.152   word similarity ≈ 1.00
```

All three fall below the 0.2 threshold — including the correctly-spelled term. The fallback will return nothing for exactly the typo/messy queries it was built to catch.

---

## Fix

Switch the fallback from full-string similarity to **word similarity** (`word_similarity()` / the `%>` operator), which scores the query against the best-matching run of words inside `search_text` rather than the whole string.

In `search_store_products` (migration `20260529182931_rag_trgm_and_variant_index.sql`), change the fallback block:

- [ ] Replace the `%` match with `%>` (operands ordered so the **query** is the left operand and `search_text` is the right — `%>` is order-sensitive: `v_clean_query %> sp.search_text`).
- [ ] Replace `similarity(sp.search_text, v_clean_query)` in both the `WHERE` filter and the `ORDER BY` with `word_similarity(v_clean_query, sp.search_text)`.
- [ ] Replace the function-level `set pg_trgm.similarity_threshold = '0.2'` with `set pg_trgm.word_similarity_threshold = '0.3'` (the `%>` operator reads `word_similarity_threshold`, not `similarity_threshold`).
- [ ] Update the `v_trgm_threshold` constant to `0.3` and keep the comment noting it must stay in sync with the SET clause.

The existing `gin (search_text gin_trgm_ops)` index already supports `%>` / `word_similarity` — no index change needed.

Resulting fallback should read roughly:

```sql
where
  sp.organization_id = p_organization_id
  and sp.store_id = p_store_id
  and v_clean_query %> sp.search_text
  and word_similarity(v_clean_query, sp.search_text) >= v_trgm_threshold
order by
  word_similarity(v_clean_query, sp.search_text) desc
limit p_limit;
```

---

## Acceptance criteria

- [ ] A misspelled single-term query ("snowbaord") that returns zero FTS rows now returns the correct product via the word-similarity fallback.
- [ ] A correctly-spelled term that happens to miss FTS still retrieves via fallback (no longer blocked by the length penalty).
- [ ] FTS-first behaviour unchanged: fallback still fires only when FTS returns zero rows.
- [ ] Return shape unchanged; `org_id` + `store_id` scoping preserved.
- [ ] `tsc --noEmit` and `npm run lint` pass.

---

## Do NOT do

- ❌ Do not change item 2 (variant indexing) or item 3 (route.ts context-carry) — they reviewed clean.
- ❌ Do not add a new migration file — amend the existing `20260529182931_rag_trgm_and_variant_index.sql` (it hasn't been applied to the linked DB yet).
- ❌ Do not merge FTS + fallback results — fallback stays zero-result-only.
- ❌ Do not introduce pgvector/embeddings.

---

## How to deliver

1. Amend the migration on the existing branch, push to update PR #7.
2. In the PR comment: confirm the threshold chosen and note the operand order on `%>`.
3. Do not merge — re-review before merge.
