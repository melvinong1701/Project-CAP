-- Add status column
ALTER TABLE conversations
  ADD COLUMN status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'pending', 'closed'));

-- Backfill all existing rows to 'open'
UPDATE conversations SET status = 'open' WHERE status IS NULL;

-- Index for the inbox query (org + status + recency)
CREATE INDEX conversations_org_status_time_idx
  ON conversations (organization_id, status, last_message_at DESC);
