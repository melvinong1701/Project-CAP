# Codex Spec — Add `refunded` as a distinct order status

## Goal

Split the current `returned` catch-all into two distinct statuses:

- **`returned`** — item physically came back (`fulfillment_status === 'returned'` or a fulfillment shipment_status of `'returned'`)
- **`refunded`** — money was given back without necessarily a physical return (`financial_status === 'refunded'` or `'partially_refunded'`, or refund objects present, but no return signal)

Currently both cases map to `returned`. A refund-only order (like order #1004) shows "Returned" in the UI, which is misleading.

---

## Files to change

1. `lib/shopifyOrders.ts` — status type + mapping logic
2. `components/CustomerPanel.tsx` — status type + badge colour

No DB migration required. The `status` column is a plain text field — the new value `refunded` will write fine.

---

## Changes

### 1. `lib/shopifyOrders.ts`

**Update the type:**

```ts
// Before
export type CustomerOrderStatus = 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'returned'

// After
export type CustomerOrderStatus = 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'returned' | 'refunded'
```

**Update `mapShopifyOrderStatus`:**

Replace the current refund/return block:

```ts
// Before
if (
  financialStatus === 'refunded' ||
  financialStatus === 'partially_refunded' ||
  fulfillmentStatus === 'returned' ||
  fulfillmentStates.includes('returned') ||
  hasRefund
) {
  return 'returned'
}
```

With:

```ts
// After
const isPhysicalReturn =
  fulfillmentStatus === 'returned' || fulfillmentStates.includes('returned')

const isRefund =
  financialStatus === 'refunded' ||
  financialStatus === 'partially_refunded' ||
  hasRefund

if (isPhysicalReturn) return 'returned'
if (isRefund) return 'refunded'
```

The rest of the function is unchanged.

---

### 2. `components/CustomerPanel.tsx`

**Update the local type (line 21):**

```ts
// Before
type CustomerOrderStatus = 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'returned'

// After
type CustomerOrderStatus = 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'returned' | 'refunded'
```

**Update `statusBadgeClass` to add a colour for `refunded`:**

```ts
// Before
if (status === 'cancelled' || status === 'returned') return 'bg-rose-50 text-rose-700'

// After
if (status === 'cancelled' || status === 'returned') return 'bg-rose-50 text-rose-700'
if (status === 'refunded') return 'bg-orange-50 text-orange-700'
```

The `formatStatus` function uses `.replace('_', ' ')` + capitalise — it will render `refunded` as "Refunded" automatically, no change needed.

---

## Success criteria

1. `tsc --noEmit` passes with no new errors.
2. An order with `financial_status: refunded` and no return signals maps to `'refunded'`, not `'returned'`.
3. An order with `fulfillment_status: returned` maps to `'returned'`.
4. The UI renders "Refunded" in an orange badge and "Returned" in a rose badge.
5. No other status mappings changed.

---

## What not to do

- Do not touch the DB schema — no migration needed.
- Do not change the `formatStatus` function — it already handles `refunded` correctly via the generic capitalise logic.
- Do not modify any other files.
