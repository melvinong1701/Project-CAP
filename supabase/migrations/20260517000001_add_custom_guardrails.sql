ALTER TABLE store_ai_config
  ADD COLUMN IF NOT EXISTS custom_guardrails text[] NOT NULL DEFAULT '{}';
