# Codex Task Spec — Deterministic Confidence Calibration (Shadow Mode)

**Type:** `build`
**Priority:** `P1 – this sprint`
**Branch:** `feature/confidence-calibration`

---

## Goal

Today AI confidence is self-reported by the reply model under a heavily caution-biased prompt, so it almost never returns HIGH ("MID-everywhere") and auto-send rarely fires — defeating the core "AI handles 60–70% autonomously" promise. Add a **deterministic promotion layer** that bumps a narrow, safe slice of MEDIUM replies to HIGH based on observable signals, and run it in **shadow mode** (log would-have-auto-sent without sending) so we can measure precision before flipping real auto-send on.

---

## Context

- Confidence is currently assigned in `lib/aiRouter.ts` by the reply model (`runReplyGeneration` → `raw.confidence`). It returns `{ text, confidence, autoSent, reasoning, sourceCited }`. `autoSent` is only `true` when the model says so **and** `confidence === 'high'`.
- `lib/autoSend.ts` already holds the deterministic post-processing pattern:
  - `downgradeForAmbiguity(confidence, catalogMatchCount, intent)` — HIGH→MEDIUM when a catalog intent has `>= CATALOG_AMBIGUITY_THRESHOLD` (5) matches. **Only ever downgrades.**
  - `canAutoSend({ autoSendEnabled, confidence, intent })` — requires `auto_send_enabled === true`, `confidence === 'high'`, and intent not in `BLOCKED_AUTO_SEND_INTENTS` (`availability`, `pricing`, `refund`, `dispute`, `returns`).
- Both consumers call these in the same order: `app/api/telegram/webhook/route.ts` (~L208–252, the server-authoritative path) and `app/api/ai/suggest/route.ts` (~L209–256). They compute `effectiveConfidence = downgradeForAmbiguity(...)` then `canAutoSend(...)`.
- Available observable signals at that call site: `result.confidence`, `result.sourceCited`, `result.text`, `preprocessing.intent`, `preprocessing.shouldEscalate`, `catalogContext.length` (catalog match count).
- `CATALOG_INTENTS` lives in `lib/catalogRetrieval.ts`.

This spec adds a **promotion** function that runs *before* `canAutoSend`, plus shadow-mode logging. It does **not** change the model prompt and does **not** loosen any existing downgrade or block.

---

## Scope — what to build

- [ ] Add `calibrateConfidence()` to `lib/autoSend.ts` — a pure function that promotes MEDIUM→HIGH only when every safe condition holds (see below). Never promotes LOW. Never overrides a downgrade (run it on the already-downgraded `effectiveConfidence`).
- [ ] Add a hedge/promise guard: a small regex set (holding/stalling phrases like "I'll look into", "let me check", "get back to you"; promise phrases like "refund", "discount", "replacement", "I've processed") that blocks promotion if the reply text matches. Mirror intent of the prompt rules at `aiRouter.ts` L104, L128.
- [ ] Add a `CALIBRATION_PROMOTE_INTENTS` allowlist: `product_question`, `shipping`, `order_status` only. (Never the 5 in `BLOCKED_AUTO_SEND_INTENTS`.)
- [ ] Add a `SHADOW_MODE` flag read from env (`CONFIDENCE_CALIBRATION_SHADOW`, default `true`). When shadow is on, compute the promotion but **do not** let it change what is actually sent — only log it.
- [ ] Add structured logging: emit a single JSON `console.info` line per suggestion with `{ event: 'confidence_calibration', conversationId, intent, modelConfidence, effectiveConfidence, promotedConfidence, wouldAutoSend, didAutoSend, sourceCited, catalogMatchCount, blockedReason }`. This is the data the eval harness / a later query consumes.
- [ ] Wire both `telegram/webhook/route.ts` and `ai/suggest/route.ts` to call `calibrateConfidence` after `downgradeForAmbiguity`, compute `wouldAutoSend` from the promoted confidence, and (only when shadow mode is OFF) feed the promoted confidence into `canAutoSend`.

### `calibrateConfidence` promotion conditions (ALL must hold)

```
promote MEDIUM → HIGH iff:
  confidence === 'medium'
  && !shouldEscalate
  && CALIBRATION_PROMOTE_INTENTS.has(intent)
  && sourceCited != null
  && (!CATALOG_INTENTS.has(intent) || catalogMatchCount === 1)
  && !hedgeOrPromiseRegex.test(text)
otherwise: return confidence unchanged
```

Suggested signature (match the `downgradeForAmbiguity` style — pure, no I/O):

```ts
export function calibrateConfidence(params: {
  confidence: AiConfidence        // already passed through downgradeForAmbiguity
  intent: AiIntent
  shouldEscalate: boolean
  sourceCited: string | null
  catalogMatchCount: number
  text: string
}): { confidence: AiConfidence; promoted: boolean; blockedReason: string | null }
```

---

## Files to create / modify

| Action | Path | Notes |
|--------|------|-------|
| Modify | `lib/autoSend.ts` | Add `calibrateConfidence`, `CALIBRATION_PROMOTE_INTENTS`, hedge/promise regex, shadow flag helper |
| Modify | `app/api/telegram/webhook/route.ts` | Call calibrate after downgrade; shadow-aware auto-send; structured log |
| Modify | `app/api/ai/suggest/route.ts` | Same wiring as webhook for parity |
| Create | `scripts/eval-calibration.ts` (+ `package.json` script `eval:calibration`) | `tsx` script asserting the `calibrateConfidence` truth table, matching the existing `scripts/eval-retrieval.ts` pattern. NOTE: repo has no jest/vitest runner — do NOT add a `*.test.ts` or a test framework. |

---

## Acceptance criteria

- [ ] `calibrateConfidence` is pure, only promotes MEDIUM→HIGH, never promotes LOW, never downgrades.
- [ ] With `CONFIDENCE_CALIBRATION_SHADOW=true` (default), real send behaviour is **byte-for-byte unchanged** vs. current `main` — promotion only appears in logs, never in what is sent or written to `ai_suggestion`.
- [ ] The structured `confidence_calibration` log line is emitted on every suggestion in both routes with all listed fields.
- [ ] A refund/dispute/availability/pricing/returns intent is never promoted (allowlist excludes them).
- [ ] A reply containing a hedge or promise phrase is never promoted; `blockedReason` records why.
- [ ] A catalog intent with `catalogMatchCount !== 1` is never promoted.
- [ ] No TypeScript errors (`tsc --noEmit` passes).
- [ ] No new `any` types introduced.
- [ ] `organization_id` scoping unchanged (no data-access changes expected).
- [ ] No channel-specific logic added outside the adapter pattern (calibration is channel-agnostic in `lib/`).

---

## Do NOT do

- ❌ Do not modify the model prompt / `PLATFORM_GUARDRAILS` in `aiRouter.ts`. Calibration is deterministic and lives outside the model.
- ❌ Do not change or remove `downgradeForAmbiguity` or `canAutoSend`. Calibration runs *between* them.
- ❌ Do not flip `CONFIDENCE_CALIBRATION_SHADOW` to `false` anywhere, and do not enable it per-store. Going live is a separate, eval-gated decision.
- ❌ Do not add a new logging dependency — use `console.info` with a JSON string, matching existing `console.error` usage in these routes.
- ❌ Do not promote LOW under any circumstance.

---

## Decisions already made

- Confidence stays model-conservative; promotion is deterministic and signal-based, not prompt-based. (Locked — LLM self-confidence is not trustworthy for irreversible auto-sends.)
- Promotion allowlist is `product_question`, `shipping`, `order_status` only for v1.
- Grounding requirement: `sourceCited != null` and (for catalog intents) exactly one match.
- Ship behind shadow mode first; real auto-send flip is gated on a **new auto-send precision harness** over the shadow logs (target ~95% before any per-store enablement). NOTE: the existing harness (`scripts/eval-retrieval.ts`, commit `a849d27`) measures **catalog retrieval precision only** — it does not measure auto-send safety. The gating harness is a sibling to it, not the same thing, and is out of scope here.

---

## Out of scope (follow-up tasks)

- Auto-send precision harness over shadow-mode logs — a **new** sibling to the existing retrieval harness (`scripts/eval-retrieval.ts`), with labelled "safe to auto-send?" cases. Separate task; this spec only emits the data it will consume.
- Per-store auto-send enablement UI / threshold config — separate task once precision clears the bar.
- Expanding the promote allowlist beyond the three intents — revisit after first precision read.
- Persisting calibration logs to a table for analytics — `console.info` is enough for v1; flag if a table is wanted.

---

## How to deliver

1. Work on branch `feature/confidence-calibration`
2. Open a PR against `main` with a one-paragraph summary
3. In the PR description: list files changed, the `calibrateConfidence` truth table, confirmation that shadow mode leaves send behaviour unchanged, and any assumptions/follow-ups
4. Do not merge — PR is reviewed before merging
