# Codex Task Spec — Merge retrieval-harness + confidence-calibration into main

**Type:** `fix` (git integration / release)
**Priority:** `P1 – this sprint`
**Branch:** work directly on `main` via two ordered merges (no new feature branch)

---

## Goal

Two unmerged feature branches both add a `tsx`-based eval script to the same region of `package.json`, and one of them depends on a devDependency the other introduces. Merge them into `main` in the correct order so both eval harnesses work on a clean install and no script is dropped in the conflict.

---

## Context

Neither branch is on `main` yet. `main`'s `scripts` block currently ends at `"lint": "next lint"` and `main` has **no `tsx`** dependency.

- **`feature/retrieval-eval-harness`** (tip `a849d27`) adds:
  - `scripts/eval-retrieval.ts`, `scripts/eval-retrieval.fixtures.ts`
  - `"eval:retrieval"` script in `package.json`
  - **`"tsx": "^4.22.4"`** as a devDependency, plus the matching `package-lock.json` entries
  - a README line
- **`feature/confidence-calibration`** (PR #8, tip `cd2f2aa`) adds:
  - `lib/autoSend.ts` (`calibrateConfidence`, shadow flag), wiring in both AI routes
  - `scripts/eval-calibration.ts`
  - `"eval:calibration"` script in `package.json`
  - **uses `tsx` but does NOT declare it** and does not touch `package-lock.json`

**The only file touched by both branches is `package.json`** (the `scripts` block, immediately after `"lint"`). The conflict is trivial to resolve by hand but must keep BOTH script lines.

**Ordering constraint (the reason this spec exists):** because `tsx` is declared only on the retrieval-harness branch, that branch MUST merge first. If confidence-calibration merges first, `eval:calibration` has no declared `tsx` and breaks on a clean `npm ci`.

---

## Scope — what to build

- [ ] Merge `feature/retrieval-eval-harness` into `main` first (it merges clean — no conflict).
- [ ] Then merge `feature/confidence-calibration` into `main`, resolving the `package.json` conflict by keeping all three script lines.
- [ ] Verify both eval harnesses and the build pass on the merged `main`.
- [ ] Push `main`.

---

## Files to create / modify

| Action | Path | Notes |
|--------|------|-------|
| Resolve | `package.json` | Keep `lint`, `eval:retrieval`, AND `eval:calibration` (see below) |
| (merge) | everything else | Comes in via the two merges; no manual edits expected |

Final `scripts` block must read exactly:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "eval:retrieval": "tsx scripts/eval-retrieval.ts",
  "eval:calibration": "tsx scripts/eval-calibration.ts"
}
```

---

## Acceptance criteria

- [ ] `feature/retrieval-eval-harness` merged into `main` before `feature/confidence-calibration`.
- [ ] Merged `main` `package.json` contains both `eval:retrieval` and `eval:calibration`, and `tsx` is present in devDependencies + `package-lock.json`.
- [ ] `npm ci` on a clean checkout of merged `main` succeeds (proves `tsx` is properly declared).
- [ ] `npm run eval:calibration` passes (expected 16/16).
- [ ] `npm run eval:retrieval` passes against the linked Supabase (expected 14/14) — requires `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env. If those aren't available in the run environment, run `eval:calibration` (no DB needed) and state clearly in the summary that `eval:retrieval` was not run and why.
- [ ] `npx tsc --noEmit` passes.
- [ ] `npm run build` passes.
- [ ] No other files show unexpected conflicts; if any do, STOP and report rather than guessing.

---

## Do NOT do

- ❌ Do not merge `feature/confidence-calibration` first. Order is fixed: retrieval-harness, then calibration.
- ❌ Do not drop, rename, or reorder any existing script when resolving the conflict.
- ❌ Do not change `CONFIDENCE_CALIBRATION_SHADOW` behaviour or flip it off — calibration stays in shadow mode after merge.
- ❌ Do not squash or rewrite the feature-branch histories — use merge commits.
- ❌ Do not touch the untracked `specs/*.md` files.
- ❌ Do not add or upgrade any dependency beyond what the branches already carry.

---

## Decisions already made

- Merge order is retrieval-harness → calibration (dependency-driven, locked).
- Conflict resolution keeps all script lines.
- Calibration remains shadow-mode after merge; turning auto-send on is a separate, eval-gated decision.

---

## Out of scope (follow-up tasks)

- The auto-send precision harness over shadow logs (gates real rollout) — separate task.
- Committing the untracked `specs/*.md` docs — separate housekeeping task.
- Deleting the merged feature branches — optional cleanup; flag in summary, don't delete unless asked.

---

## How to deliver

1. Perform the two ordered merges into `main` as described.
2. Run the verification commands above; paste their results into the summary.
3. Push `main`.
4. In the summary: confirm merge order, the final `scripts` block, which eval harnesses were run (and any skipped, with reason), and any unexpected conflicts encountered.
