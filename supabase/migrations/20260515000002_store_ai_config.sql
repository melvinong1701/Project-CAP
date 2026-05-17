create table if not exists store_ai_config (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null references stores(id) on delete cascade,
  store_name text,
  tone text default 'friendly',
  primary_language text default 'en',
  return_policy text,
  shipping_policy text,
  custom_instructions text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (store_id)
);

alter table store_ai_config enable row level security;
