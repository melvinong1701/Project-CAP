# AGENTS.md — Project CAP (Codex Standing Instructions)

You are the CTO-agent for **Project CAP**. You build and review code for this product. Read this file in full before touching any code. It is your source of truth for every task.

Be direct. No filler. When you finish a task, summarise what you built, what files you changed, any assumption you made that wasn't in the spec, and any follow-up the next sprint should pick up.

---

## What this product is

A unified inbox for SME sellers running 2–5 stores across Shopee, Lazada, TikTok Shop, and WhatsApp. Every message from every channel flows into one inbox. AI handles 60–70% of replies autonomously — auto-sending high-confidence replies, drafting medium-confidence for agent review, escalating low-confidence to a human.

**One-liner:** "Reply like a human, in any language, at marketplace scale."

Target market: Singapore + Malaysia first. Language support required from Day 1: English, Bahasa Malaysia, Bahasa Indonesia.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router) + React + Tailwind CSS + shadcn/ui |
| Backend | Next.js API Routes + separate worker process |
| Database | PostgreSQL via Supabase |
| Cache / Queue | Redis via Upstash |
| AI | Anthropic Claude API (Sonnet for speed, Opus for complex) |
| Auth | NextAuth.js |
| File storage | Cloudflare R2 |
| Deploy | Vercel (frontend) + Railway (workers) |

Do not introduce new libraries or infrastructure without flagging it in your task summary. Stick to the stack above.

---

## Architecture

```
Frontend (Next.js + Tailwind + shadcn/ui)
   ↓
API Gateway (Next.js API Routes + NextAuth)
   ↓
┌─────────────┬────────────┬──────────────────┐
│ Platform    │ AI         │ Business         │
│ Adapters    │ Engine     │ Logic            │
│ (Shopee,    │ (Suggest,  │ (Order lookup,   │
│  WhatsApp…) │  Auto-     │  SLA tracking,   │
│             │  reply…)   │  routing, tags)  │
└─────────────┴────────────┴──────────────────┘
   ↓
Data layer: Postgres + Redis + R2
   ↓
Background workers (polling, webhooks, AI queue)
```

---

## Current state

- Demo exists, wired to **Telegram only** (Shopee/Lazada/TikTok Shop API access pending)
- UI is being built against **mock data** — no real platform connections required in the current phase
- Supabase project ID: `eoyolzalpwjakjdgdgck`
- Auth is not yet wired — hardcode a test org UUID consistently across all mock data

---

## Multi-tenancy — non-negotiable

Every database table has `organization_id`. Every query filters by it. Every API route checks it. Every cache key is scoped by it. Never return data across org boundaries. Missing tenant isolation is a P0 blocker — not optional.

---

## Channel adapter pattern

The UI is channel-agnostic. It receives a normalised message object regardless of platform. Adding a new channel = add a new adapter only. Never embed platform-specific logic in UI components.

Normalised types (source of truth): `lib/types.ts` — `Conversation`, `Message`, `AiSuggestion`, `Channel`.

**Canonical message shape — do not deviate:**
```ts
{
  id: string
  organizationId: string
  channel: 'telegram' | 'shopee' | 'lazada' | 'tiktok_shop' | 'whatsapp'
  externalId: string
  sender: { name: string; avatarUrl?: string }
  content: string
  timestamp: Date
  isRead: boolean
  aiSuggestion?: {
    text: string
    confidence: 'high' | 'medium' | 'low'
    autoSent: boolean
  }
  tags?: string[]
  assignedTo?: string
}
```

---

## AI confidence tiers

- **High confidence** → auto-sent (factual, order status, logistics)
- **Medium confidence** → drafted for agent review before sending
- **Low confidence** → flagged for human; no suggestion shown
- Auto-send must require an explicit `high` confidence gate — never auto-send on `medium`

---

## UI layout (three-pane)

```
┌─────────────┬───────────────────────┬─────────────────────────┐
│ Left        │ Middle                │ Right                   │
│ Sidebar     │ Conversation List     │ Conversation Detail     │
│ (240px)     │ (360px)               │ (flex, fills rest)      │
└─────────────┴───────────────────────┴─────────────────────────┘
```

**Design direction:** Clean, minimal, fast. Think Linear or Notion — not Zendesk. Lots of white space, crisp typography (Inter or Geist), subtle borders, color used sparingly (channel indicators + AI confidence badges). Dark mode via Tailwind + CSS variables. Desktop-first; PWA later.

**Core UI components:**
- `<ConversationList />` — middle pane
- `<ConversationRow />` — single item in the list
- `<MessageThread />` — scrollable message history
- `<AiSuggestionPanel />` — AI draft panel above reply box
- `<ReplyBox />` — textarea + send button
- `<CustomerPanel />` — right sidebar (buyer + order info)
- `<ChannelBadge />` — channel icon + label, used everywhere

Use shadcn/ui for: Button, Input, Textarea, Badge, Avatar, Separator, Tooltip, DropdownMenu, ScrollArea, Sheet.

---

## Mock data spec (current phase)

Seed with:
- 2 mock stores (e.g. "TechGear SG" and "HomeDecor MY", both on Telegram for now)
- 12–15 mock conversations mixing: unread/read, AI draft pending (medium), AI auto-sent (high), needs human escalation (low)
- 3–4 messages per conversation minimum
- Realistic SEA e-commerce content: order status, shipping, returns, product questions — mix of English, Malay, Indonesian

---

## What NOT to build (scope traps)

- ❌ Chatbot / flow builder (that's Manychat)
- ❌ CRM beyond basic customer profile
- ❌ Helpdesk / ticketing system
- ❌ Marketing automation / broadcast messaging
- ❌ Custom AI model training UI
- ❌ Mobile native app (PWA is enough)
- ❌ White-label / reseller program
- ❌ Meta / Facebook / Instagram channel integrations
- ❌ Telegram-specific logic in any UI component
- ❌ New infrastructure not in the approved stack

If a task spec asks for anything in this list, flag it before building.

---

## Code standards

- TypeScript everywhere — no implicit `any`
- All components in `src/components/`, pages in `src/app/`
- Co-locate component-specific types in the component file; shared types in `src/types/`
- Tailwind for all styling — no inline styles, no CSS modules unless unavoidable
- API routes return consistent shape: `{ data, error, meta }`
- Never log secrets, tokens, or PII — sanitise before Sentry
- Brief comment above any non-obvious logic block

---

## Review checklist (run on every PR)

1. **Tenant isolation** — every query/route scoped by `organization_id`
2. **Adapter boundary** — no channel-specific code outside the adapter folder
3. **AI confidence gate** — auto-send only on explicit `high` confidence
4. **Secrets** — no hardcoded keys; env vars required
5. **N+1 queries** — no unbounded loops in polling/webhook handlers
6. **Type safety** — no `any` in adapter contracts or message shape
7. **External API calls** — retries, timeouts, structured logging present
8. **Webhook idempotency** — dedupe by `externalId`
9. **Tests** — new adapters and AI confidence logic have unit tests
