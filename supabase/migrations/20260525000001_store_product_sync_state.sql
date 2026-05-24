create table if not exists store_product_sync_state (
  organization_id uuid not null,
  store_id uuid not null,
  platform_id text not null default 'shopify',
  last_synced_at timestamptz,
  product_count integer not null default 0,
  last_sync_status text not null default 'never' check (last_sync_status in ('never', 'in_progress', 'success', 'failed')),
  last_sync_error text,
  updated_at timestamptz not null default now(),
  primary key (organization_id, store_id, platform_id)
);

alter table store_product_sync_state enable row level security;

create index if not exists store_product_sync_state_org_idx
  on store_product_sync_state (organization_id);
