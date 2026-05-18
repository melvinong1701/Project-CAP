alter table customers
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists last_contact_at timestamptz,
  add column if not exists total_orders integer not null default 0,
  add column if not exists total_spend numeric(12,2) not null default 0,
  add column if not exists tags text[] not null default '{}',
  add column if not exists merge_status text not null default 'standalone';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customers_merge_status_check'
  ) then
    alter table customers
      add constraint customers_merge_status_check
      check (merge_status in ('standalone', 'primary', 'merged_into'));
  end if;
end $$;

create index if not exists customers_org_merge_status_idx
  on customers (organization_id, merge_status);

create index if not exists customers_org_last_contact_idx
  on customers (organization_id, last_contact_at desc)
  where merge_status <> 'merged_into';

create unique index if not exists customers_org_id_key
  on customers (organization_id, id);

create unique index if not exists stores_org_id_key
  on stores (organization_id, id);

create table if not exists customer_merge_suggestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  profile_a_id uuid not null,
  profile_b_id uuid not null,
  reason text not null,
  match_signals jsonb not null default '{}',
  confidence text not null,
  status text not null default 'pending',
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint customer_merge_suggestions_distinct_profiles_check
    check (profile_a_id <> profile_b_id),
  constraint customer_merge_suggestions_confidence_check
    check (confidence in ('high', 'medium', 'low')),
  constraint customer_merge_suggestions_status_check
    check (status in ('pending', 'confirmed', 'dismissed')),
  constraint customer_merge_suggestions_profile_a_fk
    foreign key (organization_id, profile_a_id)
    references customers (organization_id, id)
    on delete cascade,
  constraint customer_merge_suggestions_profile_b_fk
    foreign key (organization_id, profile_b_id)
    references customers (organization_id, id)
    on delete cascade
);

create index if not exists customer_merge_suggestions_org_status_idx
  on customer_merge_suggestions (organization_id, status);

create index if not exists customer_merge_suggestions_profile_a_idx
  on customer_merge_suggestions (profile_a_id);

create index if not exists customer_merge_suggestions_profile_b_idx
  on customer_merge_suggestions (profile_b_id);

create unique index if not exists customer_merge_suggestions_pending_pair_key
  on customer_merge_suggestions (
    organization_id,
    least(profile_a_id, profile_b_id),
    greatest(profile_a_id, profile_b_id)
  )
  where status = 'pending';

create table if not exists customer_merges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null,
  target_id uuid not null,
  merged_by text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint customer_merges_distinct_profiles_check
    check (source_id <> target_id),
  constraint customer_merges_source_fk
    foreign key (organization_id, source_id)
    references customers (organization_id, id)
    on delete restrict,
  constraint customer_merges_target_fk
    foreign key (organization_id, target_id)
    references customers (organization_id, id)
    on delete restrict
);

create index if not exists customer_merges_org_source_idx
  on customer_merges (organization_id, source_id);

create index if not exists customer_merges_org_target_idx
  on customer_merges (organization_id, target_id);

create table if not exists customer_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null,
  store_id uuid,
  channel text not null,
  external_order_id text not null,
  status text not null,
  items_summary text,
  total_amount numeric(12,2),
  currency text not null default 'SGD',
  order_placed_at timestamptz,
  tracking_number text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  constraint customer_orders_channel_check
    check (channel in ('shopee', 'lazada', 'tiktok_shop')),
  constraint customer_orders_status_check
    check (status in ('processing', 'shipped', 'delivered', 'cancelled', 'returned')),
  constraint customer_orders_org_channel_external_key
    unique (organization_id, channel, external_order_id),
  constraint customer_orders_customer_fk
    foreign key (organization_id, customer_id)
    references customers (organization_id, id)
    on delete restrict,
  constraint customer_orders_store_fk
    foreign key (organization_id, store_id)
    references stores (organization_id, id)
    on delete restrict
);

create index if not exists customer_orders_org_customer_idx
  on customer_orders (organization_id, customer_id);

create index if not exists customer_orders_org_channel_external_idx
  on customer_orders (organization_id, channel, external_order_id);

create or replace function merge_customers(
  p_organization_id uuid,
  p_source_id uuid,
  p_target_id uuid,
  p_merged_by text
)
returns uuid
language plpgsql
as $$
declare
  source_customer customers%rowtype;
  target_customer customers%rowtype;
  merged_tags text[];
  merge_id uuid;
begin
  if p_source_id = p_target_id then
    raise exception 'Cannot merge a customer into itself';
  end if;

  perform 1
  from customers
  where organization_id = p_organization_id
    and id in (p_source_id, p_target_id)
  order by id
  for update;

  select *
  into source_customer
  from customers
  where organization_id = p_organization_id
    and id = p_source_id;

  if not found then
    raise exception 'Source customer % not found for organization %', p_source_id, p_organization_id;
  end if;

  select *
  into target_customer
  from customers
  where organization_id = p_organization_id
    and id = p_target_id;

  if not found then
    raise exception 'Target customer % not found for organization %', p_target_id, p_organization_id;
  end if;

  if source_customer.merge_status = 'merged_into' then
    raise exception 'Source customer % is already merged', p_source_id;
  end if;

  if target_customer.merge_status = 'merged_into' then
    raise exception 'Target customer % is already merged', p_target_id;
  end if;

  select coalesce(array_agg(distinct merged_tag.tag), '{}')
  into merged_tags
  from unnest(coalesce(target_customer.tags, '{}') || coalesce(source_customer.tags, '{}')) as merged_tag(tag);

  insert into customer_merges (
    organization_id,
    source_id,
    target_id,
    merged_by,
    snapshot
  )
  values (
    p_organization_id,
    p_source_id,
    p_target_id,
    p_merged_by,
    to_jsonb(source_customer)
  )
  returning id into merge_id;

  update customers
  set
    display_name = coalesce(target_customer.display_name, source_customer.display_name),
    email = coalesce(target_customer.email, source_customer.email),
    phone = coalesce(target_customer.phone, source_customer.phone),
    notes = coalesce(target_customer.notes, source_customer.notes),
    telegram_id = coalesce(target_customer.telegram_id, source_customer.telegram_id),
    shopee_buyer_id = coalesce(target_customer.shopee_buyer_id, source_customer.shopee_buyer_id),
    lazada_buyer_id = coalesce(target_customer.lazada_buyer_id, source_customer.lazada_buyer_id),
    tiktok_buyer_id = coalesce(target_customer.tiktok_buyer_id, source_customer.tiktok_buyer_id),
    first_seen_at = least(
      coalesce(target_customer.first_seen_at, source_customer.first_seen_at),
      coalesce(source_customer.first_seen_at, target_customer.first_seen_at)
    ),
    last_contact_at = greatest(
      coalesce(target_customer.last_contact_at, source_customer.last_contact_at),
      coalesce(source_customer.last_contact_at, target_customer.last_contact_at)
    ),
    total_orders = coalesce(target_customer.total_orders, 0) + coalesce(source_customer.total_orders, 0),
    total_spend = coalesce(target_customer.total_spend, 0) + coalesce(source_customer.total_spend, 0),
    tags = merged_tags,
    merge_status = 'primary'
  where organization_id = p_organization_id
    and id = p_target_id;

  update conversations
  set customer_id = p_target_id
  where organization_id = p_organization_id
    and customer_id = p_source_id;

  update customer_orders
  set customer_id = p_target_id
  where organization_id = p_organization_id
    and customer_id = p_source_id;

  update customers
  set merge_status = 'merged_into'
  where organization_id = p_organization_id
    and id = p_source_id;

  return merge_id;
end;
$$;
