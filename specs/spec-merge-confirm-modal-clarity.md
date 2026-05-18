# Spec: Merge confirm modal — clarity fix

## Goal
The `MergeConfirmModal` asks the user to pick a profile to keep, but shows no copy explaining what "keeping" a profile means or what happens to the other one. Add clear explanatory text so the agent understands the consequence before clicking Confirm.

## File
`app/customers/page.tsx` — `MergeConfirmModal` function (line ~829) and `MergeProfileCard` function (line ~911)

## Current behaviour
The modal renders two `MergeProfileCard` components side by side. The modal header says "Confirm merge". There is no instruction text. The user has to guess that clicking a card selects it as the survivor, and that the other profile will be absorbed (deleted).

## What to change

### 1. Add subtitle copy below the modal header

After the `<div className="flex items-center justify-between">` header block (line ~887), insert:

```tsx
<p className="mt-2 text-sm text-gray-500">
  Select which profile to <span className="font-medium text-gray-700">keep</span>. Its identity, conversations, and orders are preserved. The other profile will be permanently merged into it and removed.
</p>
```

### 2. Add a "Keeping this profile" label to the selected card in `MergeProfileCard`

Inside `MergeProfileCard` (line ~911), after the closing `</div>` of the `flex items-start justify-between gap-3` block (which contains the name/email/phone and the radio circle `<span>`), add:

```tsx
{selected && (
  <p className="mt-2 text-xs font-semibold text-indigo-700 bg-indigo-100 rounded-full px-2 py-0.5 inline-block">
    Keeping this profile
  </p>
)}
```

### 3. Confirm button disabled state — already correct (`disabled={!keepId || submitting}`). Do not change.

## What NOT to change
- Merge logic (`confirm` function)
- API calls (`merge-suggestions/.../confirm` or `/api/customers/manual-merge`)
- `MergeProfileCard` data display (orders, spend, channels)
- `ManualMergeModal`
- Any other component

## Verification
After the change:
- `npx tsc --noEmit` — no errors
- `npm run lint` — no errors
- `npm run build` — builds clean
- Modal shows explanatory copy below the header before any card is selected
- Selecting a card shows "Keeping this profile" pill on that card only
- Clicking the other card moves the pill
- Confirm button remains disabled until a selection is made
