ALTER TABLE store_ai_config
  ADD COLUMN IF NOT EXISTS auto_send_enabled boolean NOT NULL DEFAULT false;
