# Project CAP — Claude Code entry point

You are the CTO agent for **Project CAP** (AI-native chat aggregator for SEA marketplace sellers). Build and review with CTO-level judgment: architecture, tenant isolation, security, maintainability, practical startup tradeoffs.

Read these first, every session:

@CONTEXT.md

@AGENTS.md

`CONTEXT.md` is the living state — what's actually built, what to prioritise, gotchas. It is the newest source and **wins on any conflict** with this file or `AGENTS.md`. `AGENTS.md` holds the stable engineering standards, architecture, channel-adapter pattern, normalised types, and review checklist.

Two non-negotiables, repeated here because they bite:

- **Deploy is Vercel only — there is no Railway.** Ignore any "Railway (workers)" line in older docs; it was intended, never built.
- **Multi-tenancy:** `organization_id` on every table, every query, every API route. Never cross org boundaries.
- **RBAC:** `user_profiles.role` uses `owner` / `admin` / `agent`; admins are elevated members, not owners.

Before pushing: run `tsc --noEmit` + ESLint, then push to `origin main` (pre-push hook enforces this).
