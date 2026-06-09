# Codex Task Spec — Semantic + Multilingual Catalog RAG (pgvector embeddings)

**Type:** `build`
**Priority:** `P2 – next sprint` (do not start until there is real multilingual message traffic to test against — see Preconditions)
**Branch:** `feature/rag-pgvector-semantic`

---

## Goal

Catalog retrieval is currently lexical only: Postgres FTS (`to_tsvector('english')`) with a `pg_trgm` word-similarity fuzzy fallback. That handles English typos and exact/variant terms, but it cannot match on meaning or across languages — a Bahasa Malaysia/Indonesia query, a paraphrase ("the board for beginners"), or a synonym the catalog text doesn't contain will miss. Since the beachhead is Singapore + Malaysia with Bahasa required from Day 1, add semantic retrieval via pgvector embeddings as a third tier, so meaning-based and cross-language queries resolve. This is the upgrade that makes "AI-native RAG" real rather than keyword search.

---

## Preconditions (do not start before these are true)

- [ ] Shopee/Lazada/TikTok Shop (or continued Shopify) catalog data is syncing, so `store_products` holds real multi-language-relevant products.
- [ ] There is a real or representative set of non-English (Bahasa) customer messages to validate against. Without this, the embedding tier cannot be meaningfully tested and the cost is unjustified.

If these aren't met, stop and flag — do not build speculatively.

---

## Context

- Retrieval lives in `app/api/ai/suggest/route.ts` → `fetchCatalogContext()` → `search_store_products` RPC. Fires only for `CATALOG_INTENTS` (`product_question`, `pricing`, `availability`).
- `search_store_products` (latest: migration `20260530000001_fix_search_store_products_word_sim_operand.sql`) does FTS first, then `pg_trgm` word-similarity fallback on a `search_text` column. Returns `(title, product_type, tags, status, variants)`, limit 4.
- `store_products` has `search_vector` (tsvector) and `search_text` (text, trigram-indexed), both maintained by the `store_products_search_vector_update()` trigger.
- AI layer uses the `openai` npm package with `OPENAI_API_KEY` (see `lib/aiRouter.ts`). Embeddings should use the same client/key.
- Multi-tenancy: every query is scoped by `organization_id` + `store_id`. Never drop that.

---

## Scope — what to build

### 1. Schema: embedding column + index
- [ ] Enable the `vector` extension (pgvector) in the `extensions` schema.
- [ ] Add `embedding vector(<dim>)` to `store_products`. Use the dimension of the chosen OpenAI embedding model (state which model and dim in the PR; default to `text-embedding-3-small` / 1536 unless you justify otherwise).
- [ ] Add an approximate-NN index (HNSW preferred: `using hnsw (embedding vector_cosine_ops)`).
- [ ] Add an `embedding_text` (text) + `embedding_updated_at` (timestamptz) bookkeeping pair so you can tell when a product's embedding is stale relative to its current title/description/tags/variants.

### 2. Embedding generation (worker, not request path)
- [ ] Embeddings must be generated out-of-band, NOT inside the `/api/ai/suggest` request. Add a worker/endpoint (e.g. `POST /api/embeddings/backfill` and incremental generation on product sync) that:
  - Builds the embedding source text from title + description + product_type + tags + variant titles (reuse the same fields as `search_text`).
  - Calls OpenAI embeddings, writes `embedding`, `embedding_text`, `embedding_updated_at`.
  - Is tenant-scoped and idempotent; only re-embeds rows whose source text changed.
- [ ] Hook incremental embedding into the existing Shopify product sync / webhook path (`lib/shopifyProductSync.ts`) so new/updated products get embedded.

### 3. Retrieval: add semantic tier
- [ ] At query time in the route, generate ONE embedding for the customer query (current-turn search query, same string the lexical path uses), then call a new or extended RPC that does vector cosine search scoped by org + store.
- [ ] Tiering: keep lexical FTS/trigram as-is. Add semantic as a fallback when lexical returns zero rows, OR run semantic in parallel and merge — **propose which in the PR before implementing**, do not silently pick. Default recommendation: lexical first, semantic fallback on zero results (cheaper, preserves current behaviour for English exact matches). If merging, dedupe by product and cap at the existing limit.
- [ ] Preserve the existing return shape so `fetchCatalogContext` / `aiRouter` need no downstream changes.

### 4. Cost & latency guards
- [ ] One embedding call per inbound catalog query max; do not embed on non-catalog intents.
- [ ] Add a short timeout around the query-embedding call; on failure, fall back to lexical-only and log — never block a reply on the embedding service.

---

## Files to create / modify

| Action | Path | Notes |
|--------|------|-------|
| Create | `supabase/migrations/<ts>_pgvector_store_product_embeddings.sql` | vector ext, embedding column + HNSW index, bookkeeping cols, vector search RPC |
| Create | `app/api/embeddings/backfill/route.ts` (or worker equivalent) | tenant-scoped batch embedding generation |
| Modify | `lib/shopifyProductSync.ts` | trigger incremental embedding on product create/update |
| Modify | `app/api/ai/suggest/route.ts` | query embedding + semantic tier wiring, with timeout/fallback |
| Create | `lib/embeddings.ts` | shared helper: build source text, call OpenAI embeddings |

---

## Acceptance criteria

- [ ] A Bahasa Malaysia query for a product present in the catalog (titled in English) retrieves the right product via the semantic tier when lexical misses.
- [ ] A paraphrase / synonym query ("board for beginners") retrieves a relevant product.
- [ ] English exact-match behaviour is unchanged (lexical tier still serves it; no regression, no extra embedding call when lexical hits — if fallback design is chosen).
- [ ] No embedding generation happens in the `/api/ai/suggest` request beyond the single query embedding.
- [ ] Embedding-service failure degrades to lexical-only, never errors the reply.
- [ ] `organization_id` + `store_id` scoping enforced in the vector RPC.
- [ ] `tsc --noEmit` and `npm run lint` pass. No new `any`.

---

## Do NOT do

- ❌ Do not remove or weaken the lexical FTS / trigram tiers — semantic is additive.
- ❌ Do not embed inside the request hot path (other than the one query embedding) or on non-catalog intents.
- ❌ Do not change confidence-tiering, guardrails, or the normalised reply shape.
- ❌ Do not expand to FAQ/policy retrieval here — separate spec.
- ❌ Do not pick a chunking/merging strategy silently — propose in the PR first.

---

## Decisions already made

- pgvector (not an external vector DB) — stays inside Supabase, preserves tenant scoping and one data layer.
- Embeddings generated out-of-band and stored on `store_products`, regenerated on product change.
- Default model `text-embedding-3-small` unless justified otherwise in the PR.

---

## Out of scope (follow-up tasks)

- FAQ / knowledge-base table + retrieval.
- Standing eval harness for retrieval hit-rate + answer correctness across languages (should be built alongside or just after this, to measure the gain).
- Re-ranking / hybrid score fusion beyond simple dedupe.

---

## How to deliver

1. Branch `feature/rag-pgvector-semantic`.
2. PR against `main`. In the description: state embedding model + dimension, the tiering choice (fallback vs merge) with rationale, and migration apply status.
3. Do NOT apply the migration to the linked Supabase DB — flag it for review; it will be applied separately (as with prior RAG migrations).
4. Do not merge — review first.
