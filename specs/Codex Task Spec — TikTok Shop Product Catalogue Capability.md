# Codex Task Spec — TikTok Shop Product Catalogue Capability

**Type:** `fix`
**Priority:** `P2 – next sprint`
**Branch:** `fix/tiktok-products-capability`

> Pipeline-test task. Small and isolated by design — it's the end-to-end dry run of spec → Codex → Claude Code review → push → Notion close. Originated from the CAP Ideas Inbox (Notion).

---

## Goal

TikTok Shop is missing the **Product Catalogue** (`products`) capability in the platform registry. Every other marketplace (Shopee, Lazada, Tokopedia) lists it; TikTok Shop does not, even though it will support product sync like the others. This is a display/consistency gap in the connectors UI — add the missing capability entry.

---

## Context

- File: `lib/platformRegistry.ts` (full path in repo: `Project CAP files/lib/platformRegistry.ts`).
- `PLATFORMS` is an array of `PlatformDef`. Each has a `capabilities: PlatformCapability[]`.
- A `PlatformCapability` is `{ key, label, description, status }` where `status` is `'active' | 'coming_soon'`.
- The `tiktok_shop` entry currently has exactly three capabilities, in this order: `messages`, `ai_suggest`, `orders`.
- Shopee / Lazada / Tokopedia each carry a fourth capability that TikTok Shop is missing:
  ```ts
  {
    key: 'products',
    label: 'Product Catalogue',
    description: 'Sync products for AI product queries',
    status: 'coming_soon',
  }
  ```
- This is a static config file. No API, DB, or component changes are involved.

---

## Scope — what to build

- [ ] Add the `products` (Product Catalogue) capability to the `tiktok_shop` entry in `PLATFORMS`, matching the exact shape used by Shopee/Lazada/Tokopedia (`key: 'products'`, `label: 'Product Catalogue'`, `description: 'Sync products for AI product queries'`, `status: 'coming_soon'`).
- [ ] Place it as the last capability in the `tiktok_shop` array, after `orders` — consistent with the ordering in the other marketplace entries.

---

## Files to create / modify

| Action | Path | Notes |
|--------|------|-------|
| Modify | `lib/platformRegistry.ts` | Add one capability object to the `tiktok_shop` entry only |

---

## Acceptance criteria

- [ ] `tiktok_shop` now lists four capabilities ending in `products` / Product Catalogue / `coming_soon`.
- [ ] The new object is byte-identical in shape to the `products` capability on Shopee (same label, description, status).
- [ ] No other platform entry is touched.
- [ ] No type changes to `PlatformCapability` / `PlatformDef`.
- [ ] `tsc --noEmit` passes.
- [ ] No new `any` types introduced.

---

## Do NOT do

- ❌ Do not change `status` to `'active'` — TikTok Shop product sync is not built; it's `coming_soon` like its other capabilities.
- ❌ Do not edit Shopee / Lazada / Tokopedia / any other platform entry.
- ❌ Do not reorder or rename existing capabilities.
- ❌ Do not wire any real TikTok API — registry config only.
- ❌ Do not refactor the file or adjust formatting elsewhere.
