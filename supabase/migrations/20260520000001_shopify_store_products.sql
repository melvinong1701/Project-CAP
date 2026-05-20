alter table customer_orders
  drop constraint if exists customer_orders_channel_check;

alter table customer_orders
  add constraint customer_orders_channel_check
  check (channel in ('shopee', 'lazada', 'tiktok_shop', 'shopify'));

create table if not exists store_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null,
  platform_id text not null default 'shopify',
  external_product_id text not null,
  title text not null,
  description text,
  product_type text,
  tags text[],
  status text,
  variants jsonb not null default '[]',
  images jsonb not null default '[]',
  raw_payload jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint store_products_org_platform_external_key
    unique (organization_id, store_id, platform_id, external_product_id)
);

alter table store_products enable row level security;

create index if not exists store_products_org_store_idx
  on store_products (organization_id, store_id);
