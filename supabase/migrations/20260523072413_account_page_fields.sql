alter table user_profiles
  add column if not exists full_name text,
  add column if not exists display_name text,
  add column if not exists avatar_url text,
  add column if not exists notification_preferences jsonb not null default '{"new_message": true, "ai_escalation": true, "weekly_digest": false}',
  add column if not exists preferences jsonb not null default '{"language": "en", "timezone": "Asia/Singapore"}',
  add column if not exists email_verified boolean not null default false;

alter table organizations
  add column if not exists logo_url text,
  add column if not exists default_language text not null default 'en',
  add column if not exists default_timezone text not null default 'Asia/Singapore',
  add column if not exists plan text not null default 'starter',
  add column if not exists ai_conversation_count integer not null default 0;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_role_check'
      and conrelid = 'user_profiles'::regclass
      and pg_get_constraintdef(oid) not like '%owner%'
  ) then
    alter table user_profiles drop constraint user_profiles_role_check;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_role_check'
      and conrelid = 'user_profiles'::regclass
  ) then
    alter table user_profiles
      add constraint user_profiles_role_check
      check (role in ('owner', 'admin', 'agent'));
  end if;
end $$;

alter table user_profiles
  alter column role set default 'owner';
