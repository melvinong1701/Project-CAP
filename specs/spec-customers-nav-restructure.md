# Spec: Customers nav restructure

## Goal
Move the Customers nav item out of the Inbox section and into its own top-level position, sitting between Snapshot and the Inbox section header.

## File
`components/Sidebar.tsx`

## Current behaviour
Customers is rendered inside the `navItems.map()` loop via a hardcoded `index === 0` condition (lines 75–89). This injects a Customers button immediately after "All conversations", inside the Inbox group — visually and semantically wrong.

## Target structure
```
[Logo]
─────────────
Snapshot          ← top-level button (already exists)
Customers         ← NEW: top-level button, same style as Snapshot
─────────────
INBOX             ← section label
  All conversations
  Unread
  Assigned to me
  Snoozed
─────────────
STORES            ← section label (already exists)
  ...store list...
─────────────
[Footer: avatar + Settings]
```

## What to change

1. **Remove** the `{index === 0 && (...)}` block inside the `navItems.map()` (lines 75–89). This is the only change inside the map.

2. **Add** a new Customers button between the Snapshot `<nav>` block and the `<p>Inbox</p>` label. Match the exact style of the Snapshot button (same className, same `<button>` pattern). Use the already-imported `Users` icon.

```tsx
{/* Top-level: Customers */}
<nav className="space-y-0.5 mb-3">
  <button
    onClick={() => router.push('/customers')}
    className={cn(
      'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
      pathname === '/customers'
        ? 'bg-indigo-50 text-indigo-700 font-medium'
        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
    )}
  >
    <Users className="w-4 h-4" />
    <span>Customers</span>
  </button>
</nav>
```

Note: the Snapshot button does NOT get active-state highlighting — that's fine, leave it as-is. Customers DOES need active-state (pathname check), because it's a route page, not a filter toggle.

## What NOT to change
- API routes
- Data models
- Any logic in `app/customers/page.tsx`
- The Stores section
- The footer

## Verification
After the change:
- `npx tsc --noEmit` — no errors
- `npm run lint` — no errors
- `npm run build` — builds clean
- Visually: Customers appears between Snapshot and the Inbox section header
- Navigating to `/customers` highlights the Customers item
- Navigating to `/` does not highlight Customers
- All four Inbox filters still work
