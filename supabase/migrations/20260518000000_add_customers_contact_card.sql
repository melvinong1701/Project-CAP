create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  display_name text,
  email text,
  phone text,
  notes text,
  telegram_id text,
  shopee_buyer_id text,
  lazada_buyer_id text,
  tiktok_buyer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table conversations
  add column if not exists customer_id uuid references customers(id) on delete set null;

create index if not exists customers_org_idx
  on customers (organization_id);

create index if not exists customers_org_telegram_id_idx
  on customers (organization_id, telegram_id);

create index if not exists customers_org_shopee_buyer_id_idx
  on customers (organization_id, shopee_buyer_id);

create index if not exists customers_org_lazada_buyer_id_idx
  on customers (organization_id, lazada_buyer_id);

create index if not exists customers_org_tiktok_buyer_id_idx
  on customers (organization_id, tiktok_buyer_id);

create index if not exists conversations_org_customer_id_idx
  on conversations (organization_id, customer_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists customers_set_updated_at on customers;
create trigger customers_set_updated_at
before update on customers
for each row
execute function set_updated_at();
