# Codex Task Spec — Make credential-encryption backfill resilient to absent columns

**Status:** ready for Codex — small, blocking
**File:** `scripts/encrypt-credentials-backfill.ts`
**Branch:** `fix/backfill-column-resilience`

## Problem
Running `npx tsx scripts/encrypt-credentials-backfill.ts --dry-run` against prod fails:
```
Failed to fetch store platform credentials: column store_platforms.wa_access_token does not exist
```
The script hardcodes `SECRET_COLUMNS = ['bot_token', 'access_token', 'wa_access_token']` and `SELECT`s all three. But the WhatsApp migration (`20260602161950_whatsapp_adapter.sql`, adds `wa_phone_number_id` + `wa_access_token`) was **never applied to the live DB** — WhatsApp is on hold pending company incorporation. Confirmed live `store_platforms` has only `bot_token` and `access_token`.

## Required change
Make the backfill operate only on the secret columns that actually exist in the table, determined at runtime — do NOT hardcode the present set, and do NOT apply the WhatsApp migration to make the column appear.

1. Keep `SECRET_COLUMNS` as the full *candidate* list `['bot_token', 'access_token', 'wa_access_token']` (the universe of columns that may hold secrets).
2. Before fetching, query which candidates exist:
   ```sql
   select column_name from information_schema.columns
   where table_schema = 'public' and table_name = 'store_platforms'
     and column_name = any($1)
   ```
   (Use a Supabase RPC or a direct query via the service-role client. If easiest, `select` the candidate columns one probe at a time is acceptable, but a single information_schema lookup is cleaner.)
3. Compute `activeColumns = candidates ∩ existing`. Build the `.select()` and the per-row encryption loop from `activeColumns` only.
4. If a candidate column is absent, log one line: `Skipping <col> (column not present in store_platforms)`.
5. Per-column counts in the summary should cover only `activeColumns`.
6. Behaviour otherwise unchanged: idempotent (`enc:v1:` prefix skip), `--dry-run`, never log secret values.

## Acceptance criteria
- [ ] Dry-run succeeds against a DB where `wa_access_token` does not exist; reports `bot_token` + `access_token` counts and skips `wa_access_token` with a clear line.
- [ ] When WhatsApp's migration is later applied, the script automatically includes `wa_access_token` with no code change.
- [ ] `tsc --noEmit` + lint clean.
- [ ] No secret values logged.

## Out of scope
- Do not apply or create any WhatsApp/DB migration.
- Do not touch runtime encrypt/decrypt code — only the backfill script.
