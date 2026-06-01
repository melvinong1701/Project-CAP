# Codex Task Spec — RAG Retrieval Hardening (typo tolerance + variant indexing + context-carry)

**Type:** `build`
**Priority:** `P1 – this sprint`
**Branch:** `feature/rag-retrieval-hardening`

---

## Goal

The catalog retrieval layer is English-only Postgres full-text search (FTS). It fails on misspelled queries (zero matches), cannot match on colour/size terms that only live in variant data, and only searches the current turn's extracted tags. This makes the AI miss answerable questions for messy real-world texters. This task closes the three cheapest, highest-impact gaps so retrieval is robust enough for English-language production traffic. (Multilingual/semantic embeddings are a separate, later task — see Out of scope.)

---

## Context

Retrieval today:

- `app/api/ai/suggest/route.ts` → `fetchCatalogContext()` calls the `search_store_products` Postgres RPC with `p_query` = `preprocessing.tags.join(' ')` (falls back to `latestMessage` when no tags). Returns top-4 products, mapped into `RetrievedContextSnippet[]`. Only fires for `CATALOG_INTENTS` (`product_question`, `pricing`, `availability`).
- `search_store_products` RPC (latest def: `supabase/migrations/20260529172720_fix_catalog_search_fts_or.sql`) builds an OR-based `tsquery` from `to_tsvector('english', p_query)` lexemes and matches against `store_products.search_vector`, ranked by `ts_rank`, limit 4.
- `search_vector` (defined in `supabase/migrations/20260521000001_store_products_search.sql`, maintained by a `BEFORE INSERT OR UPDATE` trigger) currently indexes: `title + description + product_type + tags`. **Variants are NOT in it.** Variants are a `jsonb` column shaped `[{ title, price, sku, availableForSale }]`.
- The query string passed to retrieval is built only from the current customer message's tags — no carry of product names mentioned earlier in the conversation.

The `pg_trgm` extension is **not** assumed to be enabled yet — enable it in the migration.

---

## Scope — what to build

### 1. Typo-tolerant fuzzy fallback (pg_trgm)
- [ ] Enable the `pg_trgm` extension.
- [ ] Add a trigram-based text column/index suitable for fuzzy matching on product identity. Concatenate `title`, `product_type`, and `tags` into a single searchable text (a generated/maintained `search_text` column, or reuse an existing concatenation pattern), and add a GIN trigram index (`gin_trgm_ops`) on it.
- [ ] Modify `search_store_products` so that **when the FTS `tsquery` match returns zero rows**, it runs a trigram-similarity fallback against the trigram text, ordered by `similarity()` desc, with a sensible threshold (start at `0.2` — make it a clearly-marked constant in the function so it's easy to tune). Keep the same return shape and `p_limit`.
- [ ] FTS remains the primary path; trigram is fallback only. Do not run both and merge in this task.

### 2. Index variant titles
- [ ] Include variant titles (the `title` of each entry in the `variants` jsonb array) in `search_vector` so colour/size/variant terms are retrievable. Update both the initial backfill `UPDATE` and the trigger function `store_products_search_vector_update()`.
- [ ] Include variant titles in the trigram `search_text` from item 1 as well, so fuzzy fallback also covers variant terms.
- [ ] Backfill existing rows so already-synced products pick up variant terms (re-run the maintained columns over the table).

### 3. Carry last customer product mention into the query
- [ ] In `app/api/ai/suggest/route.ts`, when building `searchQuery` for `fetchCatalogContext`, append product-identifying terms from earlier customer turns in the conversation when the current turn lacks them (e.g. "the blue one" with no product name → reuse the most recent product noun/identifier the customer mentioned).
- [ ] Keep it simple and deterministic: derive the carry term from the existing `history`/`currentBlock` data already loaded in the route — do **not** add an extra LLM call. A lightweight approach (e.g. reuse the most recent prior customer turn's preprocessing tags if available, or last customer message text as a secondary query term) is acceptable. State the approach you chose in the PR summary.
- [ ] The combined query must not blow past a reasonable length; current-turn tags take priority, carried terms are supplementary.

---

## Files to create / modify

| Action | Path | Notes |
|--------|------|-------|
| Create | `supabase/migrations/<timestamp>_rag_trgm_and_variant_index.sql` | pg_trgm enable, trigram column + GIN index, variant terms into `search_vector`, updated trigger fn, backfill, updated `search_store_products` with fuzzy fallback |
| Modify | `app/api/ai/suggest/route.ts` | context-carry in `searchQuery` construction (item 3) |

---

## Acceptance criteria

- [ ] A misspelled product query (e.g. "snowbaord", "blu") that returns zero FTS rows now returns the correct product via trigram fallback.
- [ ] A query on a variant term only (e.g. a colour that exists only in `variants`, not the title) retrieves the parent product.
- [ ] A follow-up like "the blue one" after the customer named a product earlier retrieves that product.
- [ ] Exact-match FTS behaviour is unchanged when FTS already returns rows (fallback does not fire).
- [ ] Return shape of `search_store_products` is unchanged (`title, product_type, tags, status, variants`); `fetchCatalogContext` needs no shape changes.
- [ ] Trigger and backfill keep `search_vector` and the trigram text correct on insert and update.
- [ ] No TypeScript errors (`tsc --noEmit` passes).
- [ ] No new `any` types introduced.
- [ ] `organization_id` + `store_id` scoping preserved in the RPC (both still filtered).

---

## Do NOT do

- ❌ Do not add pgvector / embeddings / semantic search — separate task.
- ❌ Do not change the confidence-tiering, guardrails, or `aiRouter.ts` reply logic.
- ❌ Do not expand retrieval to policies/FAQ — this task is catalog retrieval only.
- ❌ Do not add an extra LLM/OpenAI call for the context-carry — derive it from data already in the route.
- ❌ Do not merge FTS + trigram results in one pass — trigram is a zero-result fallback only.
- ❌ Do not raise `p_limit` or change ranking of the FTS path.

---

## Decisions already made

- pg_trgm fuzzy fallback is the chosen typo-tolerance mechanism (not a spell-corrector, not embeddings).
- Trigram fires only when FTS returns zero rows. Initial similarity threshold `0.2`, as a tunable constant.
- Variant titles go into both the FTS `search_vector` and the trigram text.
- Context-carry is deterministic and LLM-free.

---

## Out of scope (follow-up tasks)

- pgvector embeddings for multilingual (Bahasa) + paraphrase retrieval — the real "RAG" upgrade, separate spec.
- FAQ / knowledge-base table + retrieval beyond catalog and policy — separate spec.
- Standing eval set for retrieval hit-rate and answer correctness — separate spec.

---

## How to deliver

1. Work on branch `feature/rag-retrieval-hardening`
2. Open a PR against `main` with a one-paragraph summary
3. In the PR description: list files changed, the context-carry approach chosen, the chosen trigram threshold, and any follow-ups flagged
4. Do not merge — the PR is reviewed before merging
