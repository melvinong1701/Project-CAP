ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_suggestion JSONB;
