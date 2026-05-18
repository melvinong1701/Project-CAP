# Codex Task Spec: Clarify Customer Merge Confirmation Modal

**Type:** `fix`  
**Priority:** `P1 - this sprint`  
**Branch:** `fix/merge-confirm-modal-clarity`

---

## Goal

Make the customer merge confirmation modal clearly explain that the user is choosing the surviving customer profile. The UI should make it obvious which profile will be kept and which profile will be permanently removed after merge.

---

## Context

The Customers page already has a merge confirmation modal in `app/customers/page.tsx`.

The relevant components are:
- `MergeConfirmModal`
- `MergeProfileCard`

Current problem:
- The modal shows two profile cards side by side.
- There is no explanatory copy beneath the heading.
- Each card uses a small radio dot, so users may not understand that selecting one means "keep this profile" and the other profile will be merged away.
- The `Confirm merge` button is already disabled until a keep profile is selected.

This is a UI-only clarity fix. Merge behaviour and API calls already exist and should not change.

---

## Scope - What To Build

- [ ] In `MergeConfirmModal`, add a subtitle directly beneath the `Confirm merge` heading:

  ```text
  Choose which profile to keep. The other will be merged into it and permanently removed.
  ```

- [ ] In `MergeProfileCard`, replace the selected-state radio dot with a visible badge that says:

  ```text
  Keep
  ```

- [ ] Style the `Keep` badge using existing Tailwind/shadcn patterns only. Use green or indigo styling.

- [ ] On the unselected card, after a selection has been made on the other card, show muted warning text or badge:

  ```text
  Will be removed
  ```

- [ ] Before either card is selected, do not show destructive wording. Either show nothing in the status area or use a neutral hint:

  ```text
  Select
  ```

- [ ] Keep the existing behaviour where `Confirm merge` is disabled until a profile is selected.

- [ ] Preserve the current side-by-side card layout and existing profile details.

---

## Files To Modify

| Action | Path | Notes |
|--------|------|-------|
| Modify | `app/customers/page.tsx` | Only update `MergeConfirmModal` and `MergeProfileCard` UI |

---

## Acceptance Criteria

- [ ] The modal heading still says `Confirm merge`.
- [ ] The subtitle appears immediately under the heading and is readable at modal width.
- [ ] Selecting a profile clearly marks that selected card with a `Keep` badge.
- [ ] Once one profile is selected, the other card clearly displays `Will be removed`.
- [ ] Before selection, neither card implies that a profile will be removed.
- [ ] `Confirm merge` remains disabled before selection and enabled after selection.
- [ ] No API routes, route handlers, merge RPC calls, data models, or backend logic are changed.
- [ ] No new dependencies are added.
- [ ] TypeScript passes with `tsc --noEmit`.
- [ ] Lint passes.
- [ ] Production build passes.

---

## Do NOT Do

- Do not change customer merge API behaviour.
- Do not change the request body shape for merge confirmation.
- Do not edit files outside `app/customers/page.tsx`.
- Do not introduce new components outside this file.
- Do not add dependencies.
- Do not rename customer fields or merge suggestion fields.
- Do not alter tenant scoping or organization logic.

---

## Verification Commands

Run all of these before pushing:

```bash
tsc --noEmit
npm run lint
npm run build
```

If this project uses `npx tsc --noEmit` instead of a direct `tsc` binary, use the project-standard command and mention it in the handoff.

---

## Suggested Implementation Notes

- Keep selection state owned by the existing modal state.
- Pass enough state into `MergeProfileCard` for it to know:
  - whether this card is selected
  - whether any card has been selected
- A simple status prop is fine, for example:

  ```ts
  status: 'idle' | 'keep' | 'remove'
  ```

- Use accessible text, not just color, for the selected and removed states.
- Keep the whole card clickable if that is the current interaction pattern.
- Make the status badge layout stable so the card content does not jump awkwardly when a selection is made.

---

## Delivery Notes

When done, summarize:
- the exact UI copy added
- the selected and unselected card states
- the verification commands run and their results
