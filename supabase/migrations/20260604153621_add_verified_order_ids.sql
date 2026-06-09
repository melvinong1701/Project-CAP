alter table public.conversations
  add column if not exists verified_order_ids uuid[] not null default '{}';
