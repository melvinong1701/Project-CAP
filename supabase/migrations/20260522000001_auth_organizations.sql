create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

insert into organizations (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Default Organization')
on conflict (id) do nothing;

create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete restrict,
  role text not null default 'admin' check (role in ('admin', 'agent')),
  email text not null,
  created_at timestamptz not null default now()
);

create index if not exists user_profiles_org_idx on user_profiles (organization_id);
