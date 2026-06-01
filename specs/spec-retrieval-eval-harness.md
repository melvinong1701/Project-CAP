# Codex Task Spec — Retrieval Eval Harness

**Type:** `build`
**Priority:** `P1 – this sprint`
**Branch:** `feature/retrieval-eval-harness`

---

## Goal

Build a small, repeatable evaluation that measures whether catalog retrieval returns the right product for a set of labelled queries, and prints a hit-rate. This locks in the retrieval quality just shipped (FTS + trigram word-similarity fallback + variant indexing + context-carry) and becomes the gate for the upcoming multilingual embeddings upgrade — so that change can be proven to help rather than shipped on vibes.

---

> **Drift note (reviewed 2026-06-01):** retrieval was extracted out of the suggest route into a shared lib since this spec was first drafted. Locations, `p_limit`, and RPC behaviour below reflect the current code.

- Retrieval lives in `lib/catalogRetrieval.ts`, which exports `fetchCatalogContext()` (calls the `search_store_products` Postgres RPC and maps rows to `RetrievedContextSnippet[]`) and `buildCatalogSearchQuery()` (constructs `p_query` from preprocessing tags / message / context-carry). It is consumed by **both** `app/api/ai/suggest/route.ts` and `app/api/telegram/webhook/route.ts` (the latter is now the server-authoritative path). It fires only for `CATALOG_INTENTS` (`product_question`, `pricing`, `availability`).
- The RPC (current definition: migration `20260531174252_search_store_products_and_first`; verify in `supabase/migrations/` — local file timestamps have drifted from applied DB versions) does **tiered** matching: Tier 1 AND-tsquery (every lexeme must match), Tier 2 OR-tsquery fallback, Tier 3 `word_similarity` (`%>`) trigram fallback for typos. It filters to **active products only** (`lower(status) = 'active'` — Draft/Archived never returned), is scoped by `organization_id` + `store_id`, and returns `{ title, product_type, tags, status, variants }`.
- `fetchCatalogContext` calls the RPC with `p_query` and `p_limit: 8` (the `CATALOG_SEARCH_LIMIT` constant — note the SQL `default 4` is overridden by the app). The eval must use **8** to mirror production. `p_query` is produced by `buildCatalogSearchQuery` (= preprocessing tags joined, falling back to latest message, plus context-carry). The eval should reuse that exported function rather than re-derive it (see below).
- There is **no** retrieval evaluation today. The RAG hardening spec explicitly deferred "a standing eval set for retrieval hit-rate and answer correctness."
- `store_products` has ~17 rows for the test store (store "Oak & Sand SG"), ~13 of them active snowboards — so there are inactive rows available to exercise the active-only filter.
- The `scripts/` directory uses **plain ESM `.mjs`** (see `scripts/guardrail-smoke-test.mjs`), reading secrets straight from `process.env` (no `dotenv` dependency). There is no `tsx`/`ts-node` installed.
- **Query-construction reuse:** `buildCatalogSearchQuery` is now exported from `lib/catalogRetrieval.ts`. To satisfy "same query construction as production" without re-porting preprocessing into `.mjs`, the **preferred** approach is to add `tsx` (dev dependency) and run `tsx scripts/eval-retrieval.ts`, importing `buildCatalogSearchQuery` + `fetchCatalogContext` directly. If we want to avoid adding `tsx`, the fallback is a `.mjs` runner that passes each labelled query straight in as `p_query` (the single-tag / message-fallback path) — simpler and deterministic, but it does **not** exercise tag extraction or context-carry. Pick one explicitly; see Open decision below.
- Env / DB access: server code reads Supabase via `lib/supabaseAdmin.ts` (`createSupabaseAdminClient()`, service role) and `NEXT_PUBLIC_SUPABASE_URL`. The eval calls the `search_store_products` RPC directly through a service-role `@supabase/supabase-js` client — it does **not** go through the HTTP route or the LLM.

This task is intentionally small. It is a measurement tool, not a framework. A dozen labelled queries that exercise the known failure modes is enough to start.

---

## Scope — what to build

### 1. A labelled eval set
- [ ] Create a fixtures file of labelled retrieval cases. Each case: `{ query: string, expectedProductTitle: string, note?: string }`. The `expectedProductTitle` is matched against the `title` field returned by the RPC.
- [ ] Cover the failure modes the retrieval work targeted, derived from the **actual products in the test store** (read them first so labels are real, not invented):
  - exact title match
  - misspelled title (e.g. one character off) — exercises the Tier 3 trigram fallback
  - variant-only term (a colour/size that exists only in `variants`, not the title)
  - partial / natural-phrasing query ("do you sell …", "how much is the …")
  - precise multi-term query that should return exactly one product — exercises Tier 1 AND-tsquery precision (`expectedTopRank: 1`)
  - **active-only filter:** a term that matches a Draft/Archived product → expect that product is NOT returned (locks in the no-leak guarantee)
  - a query that *should* return nothing (negative case — expected result is "no product")
- [ ] 10–15 cases total. Keep them in the repo as data, not hardcoded in the runner.

### 2. A runner script
- [ ] Create the runner per the Open decision below — either `scripts/eval-retrieval.ts` (run with `tsx`, imports `buildCatalogSearchQuery` + `fetchCatalogContext` from `lib/catalogRetrieval.ts`) or `scripts/eval-retrieval.mjs` (plain ESM, query passed straight in as `p_query`). Match the `scripts/guardrail-smoke-test.mjs` convention for env handling (read from `process.env`).
- [ ] For each case: call the `search_store_products` RPC with the same parameters production uses — `p_limit: 8` (the `CATALOG_SEARCH_LIMIT` constant, **not** the SQL default of 4), `p_organization_id` + `p_store_id` scoping. In the `tsx` variant, build `p_query` via `buildCatalogSearchQuery`; in the `.mjs` variant, pass the labelled query string directly as `p_query`.
- [ ] Score a case as a **hit** if `expectedProductTitle` appears in the returned top-`p_limit` (8) titles (case-insensitive, trimmed). For cases with `expectedTopRank: 1`, the expected title must be the **first** row. For negative cases, a hit means the RPC returned no rows.
- [ ] Print per-case PASS/FAIL plus an aggregate: `hits / total` and the hit-rate percentage. Exit non-zero if hit-rate falls below a configurable floor (default e.g. 0.7) so it can gate CI later.

### 3. Baseline + doc
- [ ] Run it against the current linked DB and record the baseline hit-rate in a short header comment in the fixtures file and in the PR description.
- [ ] Add a one-paragraph "How to run" note to the script header or `README` (`node scripts/eval-retrieval.mjs`, required env vars).

---

## Files to create / modify

| Action | Path | Notes |
|--------|------|-------|
| Create | `scripts/eval-retrieval.ts` (tsx) **or** `.mjs` | Runner: loops cases, calls `search_store_products` with `p_limit: 8`, scores, prints hit-rate, exits non-zero below floor |
| Create | `scripts/eval-retrieval.fixtures.(ts\|mjs\|json)` | 10–15 labelled cases derived from real `store_products` rows |
| Modify | `package.json` | Add `tsx` devDep + an `npm run eval:retrieval` script (only if the `tsx` form is chosen) |
| Modify | `README.md` | One-line "How to run the retrieval eval" |

---

## Acceptance criteria

- [ ] The runner runs end-to-end against the linked DB and prints per-case results plus an aggregate hit-rate.
- [ ] The fixtures include at least one case per failure mode listed in Scope §1 (including the active-only no-leak case and the `expectedTopRank: 1` precision case), all referencing products that actually exist in the test store.
- [ ] The runner calls the RPC with `p_limit: 8` and org/store scoping. In the `tsx` variant it reuses the exported `buildCatalogSearchQuery` (no divergent preprocessing re-implementation); in the `.mjs` variant the deliberate simplification (raw query as `p_query`) is documented in the script header.
- [ ] Exit code is non-zero when hit-rate is below the configured floor, zero otherwise.
- [ ] Baseline hit-rate is recorded in the PR description.
- [ ] `tsc --noEmit` passes; `npm run lint` passes.
- [ ] No new `any` types introduced. `organization_id` + `store_id` scoping is passed through to the RPC.

---

## Do NOT do

- ❌ Do not call the OpenAI API or evaluate reply *wording* in this task — this measures **retrieval** (did the right product come back), not generation quality. Answer-correctness grading is a follow-up.
- ❌ Do not add a heavyweight eval framework or new heavy dependencies — a script + a fixtures file is the deliverable. `tsx`/`ts-node` if not already present is acceptable; flag it.
- ❌ Do not modify `search_store_products`, `fetchCatalogContext`, or any retrieval behaviour — this task only measures.
- ❌ Do not wire it into CI in this task (the non-zero exit code makes that trivial later) — just make it CI-ready.

---

## Open decision (resolve before building)

**Runner form — `tsx` import vs `.mjs` raw-query.** Two viable shapes:
- **`tsx` (recommended):** add `tsx` as a dev dependency, write `scripts/eval-retrieval.ts`, import `buildCatalogSearchQuery` + `fetchCatalogContext` directly. Tests production query construction faithfully; costs one small dev dependency.
- **`.mjs` (zero new deps):** pass the labelled query straight in as `p_query`. Deterministic and dependency-free, but skips tag extraction / context-carry, so it tests the **RPC** not the full retrieval path.

Either way the eval does **not** call the LLM preprocessing step (nano tag extraction) — that is non-deterministic and belongs in the answer-quality eval, not here. Default recommendation: `tsx`, because criterion "same query construction as production" is otherwise unmet.

## Decisions already made

- The eval calls the RPC directly via the service-role admin client, not through the HTTP route or the LLM.
- `p_limit: 8` (mirrors the app constant, not the SQL default of 4).
- Hit = expected product title in the returned top-`p_limit`; `expectedTopRank: 1` cases require first position; negative case = zero rows returned.
- Fixtures are real-product-derived and version-controlled as data.
- Default hit-rate floor is configurable; gating CI is a later step.

---

## Out of scope (follow-up tasks)

- Answer-correctness eval (grade the generated reply against a rubric, likely LLM-as-judge) — separate spec.
- Multilingual / Bahasa retrieval cases — add once embeddings land; this baseline is English.
- Wiring the eval into CI as a required check — trivial follow-up once this is green.
- Expanding fixtures to policy/FAQ retrieval — depends on the policy/FAQ KB task.
- Confidence behaviour (the ≥5-match ambiguity → MEDIUM downgrade, `canAutoSend` gating) — that's generation/confidence, not retrieval. It doesn't change which rows return, so it belongs in the answer-quality / confidence-calibration eval, not here.

---

## How to deliver

1. Work on branch `feature/retrieval-eval-harness`.
2. Open a PR against `main` with a one-paragraph summary.
3. In the PR description: include the baseline hit-rate, the list of failure modes covered, and any new dependency added.
4. Do not merge — review first.
