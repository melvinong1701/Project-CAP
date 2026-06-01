-- Run with:
--   supabase db query --linked --file scripts/verify-tenant-isolation.sql
--
-- The script seeds two throwaway org contexts inside one transaction, switches
-- into the authenticated role, verifies org A cannot see or mutate org B rows,
-- then rolls everything back.

begin;

do $$
declare
  org_a uuid := '10000000-0000-0000-0000-000000000001';
  org_b uuid := '10000000-0000-0000-0000-000000000002';
  user_a uuid := '20000000-0000-0000-0000-000000000001';
  user_b uuid := '20000000-0000-0000-0000-000000000002';
  customer_a uuid := '30000000-0000-0000-0000-000000000001';
  customer_b uuid := '30000000-0000-0000-0000-000000000002';
  conversation_a uuid := '40000000-0000-0000-0000-000000000001';
  conversation_b uuid := '40000000-0000-0000-0000-000000000002';
  order_a uuid := '50000000-0000-0000-0000-000000000001';
  order_b uuid := '50000000-0000-0000-0000-000000000002';
begin
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data
  )
  values
    (
      '00000000-0000-0000-0000-000000000000',
      user_a,
      'authenticated',
      'authenticated',
      'rls-org-a@example.invalid',
      '',
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      user_b,
      'authenticated',
      'authenticated',
      'rls-org-b@example.invalid',
      '',
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb
    )
  on conflict (id) do nothing;

  insert into public.organizations (id, name)
  values
    (org_a, 'RLS Test Org A'),
    (org_b, 'RLS Test Org B')
  on conflict (id) do nothing;

  insert into public.user_profiles (id, organization_id, role, email)
  values
    (user_a, org_a, 'owner', 'rls-org-a@example.invalid'),
    (user_b, org_b, 'owner', 'rls-org-b@example.invalid')
  on conflict (id) do update
  set organization_id = excluded.organization_id,
      role = excluded.role,
      email = excluded.email;

  insert into public.customers (id, organization_id, display_name, email)
  values
    (customer_a, org_a, 'RLS Customer A', 'customer-a@example.invalid'),
    (customer_b, org_b, 'RLS Customer B', 'customer-b@example.invalid')
  on conflict (id) do update
  set organization_id = excluded.organization_id,
      display_name = excluded.display_name,
      email = excluded.email;

  insert into public.conversations (
    id,
    organization_id,
    customer_id,
    channel,
    external_id,
    sender_name,
    last_message
  )
  values
    (conversation_a, org_a, customer_a, 'telegram', 'rls-conversation-a', 'Customer A', 'hello a'),
    (conversation_b, org_b, customer_b, 'telegram', 'rls-conversation-b', 'Customer B', 'hello b')
  on conflict (id) do update
  set organization_id = excluded.organization_id,
      customer_id = excluded.customer_id,
      channel = excluded.channel,
      external_id = excluded.external_id,
      sender_name = excluded.sender_name,
      last_message = excluded.last_message;

  insert into public.customer_orders (
    id,
    organization_id,
    customer_id,
    channel,
    external_order_id,
    status
  )
  values
    (order_a, org_a, customer_a, 'shopify', 'rls-order-a', 'processing'),
    (order_b, org_b, customer_b, 'shopify', 'rls-order-b', 'processing')
  on conflict (organization_id, channel, external_order_id) do update
  set customer_id = excluded.customer_id,
      status = excluded.status;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  org_a uuid := '10000000-0000-0000-0000-000000000001';
  org_b uuid := '10000000-0000-0000-0000-000000000002';
  visible_count integer;
  changed_count integer;
  cross_org_insert_blocked boolean := false;
begin
  select count(*) into visible_count
  from public.customers
  where organization_id = org_a;

  if visible_count <> 1 then
    raise exception 'Expected org A to see 1 own customer, saw %', visible_count;
  end if;

  select count(*) into visible_count
  from public.customers
  where organization_id = org_b;

  if visible_count <> 0 then
    raise exception 'Expected org A to see 0 org B customers, saw %', visible_count;
  end if;

  select count(*) into visible_count
  from public.conversations
  where organization_id = org_b;

  if visible_count <> 0 then
    raise exception 'Expected org A to see 0 org B conversations, saw %', visible_count;
  end if;

  select count(*) into visible_count
  from public.customer_orders
  where organization_id = org_b;

  if visible_count <> 0 then
    raise exception 'Expected org A to see 0 org B orders, saw %', visible_count;
  end if;

  update public.customers
  set notes = 'cross-org update should not land'
  where organization_id = org_b;

  get diagnostics changed_count = row_count;

  if changed_count <> 0 then
    raise exception 'Expected org A to update 0 org B customers, updated %', changed_count;
  end if;

  begin
    insert into public.customers (
      id,
      organization_id,
      display_name,
      email
    )
    values (
      '30000000-0000-0000-0000-000000000003',
      org_b,
      'Blocked Cross Org Customer',
      'blocked-cross-org@example.invalid'
    );
  exception
    when others then
      cross_org_insert_blocked := true;
  end;

  if not cross_org_insert_blocked then
    raise exception 'Expected org A insert into org B to be blocked';
  end if;
end $$;

rollback;
