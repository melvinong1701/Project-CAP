# AGENTS.md — Project CAP (Codex Standing Instructions)

You are the CTO-agent for **Project CAP**. You build and review code for this product. Read this file in full before touching any code. It is your source of truth for every task.

Be direct. No filler. When you finish a task, summarise what you built, what files you changed, any assumption you made that wasn't in the spec, and any follow-up the next sprint should pick up.

> **Read `CONTEXT.md` (repo root) first, every task.** It is the newest source of truth for what's actually built, what's in flight, and what to work on — and it **wins on any conflict** with this file. `AGENTS.md` holds the *stable* standards (architecture, adapter pattern, normalised types, review checklist); `CONTEXT.md` holds the *fast-moving* state. If `CONTEXT.md` is not present in your checkout, say so in your task summary — you are likely missing current context.

---

## Coding behaviour

These rules bias toward caution over speed. For trivial tasks, use judgment.

**Think before coding.** State your assumptions explicitly before implementing. If multiple interpretations exist, present them instead of choosing silently. If a simpler approach exists, say so. Push back when warranted. If something is unclear, stop, name what is confusing, and ask.

**Simplicity first.** Write the minimum code that solves the problem. Do not add features beyond what was asked, abstractions for single-use code, speculative configurability, or error handling for impossible scenarios. If a solution is much longer than it needs to be, rewrite it smaller. Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

**Surgical changes.** Touch only what the task requires. Do not improve adjacent code, refactor things that are not broken, or reformat existing style. Match local conventions even if you would normally do it differently. If your change creates unused imports, variables, functions, or other orphans, remove them. Do not remove pre-existing dead code unless asked; mention it instead. Every changed line should trace directly to the request.

**Goal-driven execution.** Convert tasks into verifiable goals before coding. For multi-step work, state a brief plan with checks, for example: "1. Add validation -> verify invalid-input tests fail, then pass." For bug fixes, reproduce the bug with a test or clear manual check before fixing when practical. Keep looping until the stated success criteria are verified.

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
| Backend | Next.js API Routes (no separate worker process — everything runs on Vercel) |
| Database | PostgreSQL via Supabase |
| AI | OpenAI API with two-queue model routing |
| Auth | Supabase Auth (`@supabase/ssr`) — RBAC via `user_profiles.role` (`owner` / `agent`); org context via `lib/getOrgId.ts` |
| Deploy | **Vercel only** — frontend, API routes, webhooks, and the AI queue all run on Vercel. No Railway; there is no separate worker tier. |

Do not introduce new libraries or infrastructure without flagging it in your task summary. Stick to the stack above.

**Not currently used:** Redis/Upstash (cache/queue) and Cloudflare R2 (storage) appear in older plans but are not in the codebase — there is no separate cache tier or object store. Reintroduce only if scale requires, and flag it.

---

## Architecture

```
Frontend (Next.js + Tailwind + shadcn/ui)
   ↓
API Gateway (Next.js API Routes + Supabase Auth)
   ↓
┌─────────────┬────────────┬──────────────────┐
│ Platform    │ AI         │ Business         │
│ Adapters    │ Engine     │ Logic            │
│ (Shopee,    │ (Suggest,  │ (Order lookup,   │
│  WhatsApp…) │  Auto-     │  SLA tracking,   │
│             │  reply…)   │  routing, tags)  │
└─────────────┴────────────┴──────────────────┘
   ↓
Data layer: Postgres (Supabase)
   ↓
Webhooks + AI queue: Next.js API routes on Vercel (no separate worker tier)
```

---

## Current state

**Do not trust a static list here — it drifts.** The authoritative, continuously-updated current state (what's built, what's in flight, gotchas, priorities) lives in **`CONTEXT.md`** at the repo root. Read it before starting any task. (The hard-coded bullets that used to live here went stale — e.g. they claimed "Shopify Phase 2 not built" long after catalogue sync, RAG, KB, RLS, and the WhatsApp adapter shipped.)

Durable facts that rarely change:
- Supabase project ID: `eoyolzalpwjakjdgdgck`
- Multi-tenancy, auth/RBAC, the channel-adapter pattern, AI model routing, and the review checklist are documented in the sections below.

---

## Multi-tenancy — non-negotiable

Every database table has `organization_id`. Every query filters by it. Every API route checks it. Every cache key is scoped by it. Never return data across org boundaries. Missing tenant isolation is a P0 blocker — not optional.

---

## Channel adapter pattern

The UI is channel-agnostic. It receives a normalised message object regardless of platform. Adding a new channel = add a new adapter only. Never embed platform-specific logic in UI components.

Normalised types (source of truth): `lib/types.ts` — `Conversation`, `Message`, `AiSuggestion`, `Channel`.

**Canonical message shape — `lib/types.ts` is the source of truth.** Keep that file in sync when adding adapters. Current shape:
```ts
// Channel union (see lib/types.ts for live list)
type Channel =
  | 'telegram'
  | 'shopify'
  | 'shopee'
  | 'lazada'
  | 'tiktok_shop'
  | 'tokopedia'
  | 'whatsapp'
  | 'line'
  | 'facebook_messenger'
  | 'instagram'

interface Conversation {
  id: string
  organizationId: string
  channel: Channel
  externalId: string
  sender: { name: string; avatarUrl?: string }
  content: string
  timestamp: Date
  isRead: boolean
  aiSuggestion?: AiSuggestion
  tags?: string[]
  assignedTo?: string
}

// AiSuggestion is a discriminated union — success or error
type AiSuggestion =
  | {
      text: string
      confidence: 'high' | 'medium' | 'low'
      autoSent: boolean
      dismissed: boolean
      reasoning?: string
      sourceCited?: string | null
    }
  | { error: string; dismissed: false }
```

---

## AI confidence tiers

- **High confidence** → auto-sent (factual, order status, logistics)
- **Medium confidence** → drafted for agent review before sending
- **Low confidence** → flagged for human; no suggestion shown
- Auto-send must require an explicit `high` confidence gate — never auto-send on `medium`

## AI model routing

Use two separate queues, not a single 80/15/5 distribution.

**Queue 1 — Pre-processing:** run `gpt-5.4-nano` on 100% of inbound messages for language detection, intent classification, sentiment/urgency scoring, and routing.

**Queue 2 — Reply generation:** use `gpt-5.4-mini` for normal replies. Use `gpt-5.4` for escalation replies chosen up front by Queue 1. Do not put `gpt-5.5` in the default escalation path unless a later evaluation explicitly justifies the cost.

Escalate from Queue 1 to `gpt-5.4` when sentiment is `negative` and urgency is `high`, or when intent is `refund`/`dispute`. A low-confidence `gpt-5.4-mini` reply is surfaced to the human, not regenerated by `gpt-5.4`.

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

## Mock data spec (archived — no longer the current phase)

Seed with:
- 2 mock stores (e.g. "TechGear SG" and "HomeDecor MY", both on Telegram for now)
- 12–15 mock conversations mixing: unread/read, AI draft pending (medium), AI auto-sent (high), needs human escalation (low)
- 3–4 messages per conversation minimum
- Realistic SEA e-commerce content: order status, shipping, returns, product questions — mix of English, Malay, Indonesian

---

## What NOT to build (scope traps)

- ❌ Chatbot / flow builder (that's Manychat)
- ❌ CRM beyond customer profile + cross-channel identity resolution (no deal pipelines, no lifecycle stages, no sales-team CRM features)
- ❌ Helpdesk / ticketing system
- ❌ Marketing automation / broadcast messaging
- ❌ Custom AI model training UI
- ❌ Mobile native app (PWA is enough)
- ❌ White-label / reseller program
- ❌ Telegram-specific logic in any UI component
- ❌ New infrastructure not in the approved stack

If a task spec asks for anything in this list, flag it before building.

---

## Local setup gotchas

- **iCloud/Dropbox-synced checkouts duplicate files** (e.g. `@types/node 2`), which breaks `tsc` and blocks the pre-push hook with `TS2688: Cannot find type definition file`. Fix: `rm -rf node_modules/@types/*\ 2` (or `rm -rf node_modules && npm ci`), and keep the repo out of a synced folder.

---

## Code standards

- TypeScript everywhere — no implicit `any`
- Components in `components/`, pages in `app/` (no `src/` directory)
- Co-locate component-specific types in the component file; shared types in `lib/types.ts`
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
