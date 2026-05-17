alter table conversations
  add column if not exists ai_intent text,
  add column if not exists ai_language text,
  add column if not exists ai_sentiment text,
  add column if not exists ai_urgency text;

create index if not exists conversations_org_ai_intent_idx
  on conversations (organization_id, ai_intent);

create index if not exists conversations_org_ai_sentiment_urgency_idx
  on conversations (organization_id, ai_sentiment, ai_urgency);
