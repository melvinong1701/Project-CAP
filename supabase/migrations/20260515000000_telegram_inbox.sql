create extension if not exists pgcrypto;

alter table stores
  add column if not exists organization_id uuid;

update stores
set organization_id = '00000000-0000-0000-0000-000000000001'
where organization_id is null;

alter table stores
  alter column organization_id set not null;

alter table store_platforms
  add column if not exists organization_id uuid,
  add column if not exists bot_token text,
  add column if not exists account_label text;

update store_platforms sp
set organization_id = s.organization_id
from stores s
where sp.store_id = s.id
  and sp.organization_id is null;

update store_platforms
set organization_id = '00000000-0000-0000-0000-000000000001'
where organization_id is null;

alter table store_platforms
  alter column organization_id set not null;

create unique index if not exists store_platforms_store_platform_key
  on store_platforms (store_id, platform_id);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid references stores(id) on delete set null,
  channel text not null,
  external_id text not null,
  sender_name text not null default '',
  sender_avatar text,
  last_message text,
  last_message_at timestamptz not null default now(),
  is_read boolean not null default false,
  tags text[],
  assigned_to text,
  created_at timestamptz not null default now()
);

create unique index if not exists conversations_store_channel_external_key
  on conversations (store_id, channel, external_id);

create index if not exists conversations_org_last_message_at_idx
  on conversations (organization_id, last_message_at desc);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null references conversations(id) on delete cascade,
  external_id text,
  sender text not null,
  content text not null,
  timestamp timestamptz not null default now()
);

alter table messages
  add column if not exists organization_id uuid,
  add column if not exists external_id text;

update messages m
set organization_id = c.organization_id
from conversations c
where m.conversation_id = c.id
  and m.organization_id is null;

update messages
set organization_id = '00000000-0000-0000-0000-000000000001'
where organization_id is null;

alter table messages
  alter column organization_id set not null;

create unique index if not exists messages_conversation_external_key
  on messages (conversation_id, external_id);

create index if not exists messages_org_conversation_timestamp_idx
  on messages (organization_id, conversation_id, timestamp);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table conversations;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table messages;
  end if;
end $$;
