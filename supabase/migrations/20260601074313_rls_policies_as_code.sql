create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.auth_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select up.organization_id
  from public.user_profiles up
  where up.id = auth.uid()
  limit 1
$$;

create or replace function private.auth_is_org_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.organization_id = private.auth_org_id()
      and up.role in ('owner', 'admin')
  )
$$;

revoke all on function private.auth_org_id() from public;
revoke all on function private.auth_is_org_owner() from public;
grant execute on function private.auth_org_id() to authenticated;
grant execute on function private.auth_is_org_owner() to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'set_updated_at'
      and p.pronargs = 0
  ) then
    alter function public.set_updated_at() set search_path = pg_catalog;
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'merge_customers'
      and p.pronargs = 4
  ) then
    alter function public.merge_customers(uuid, uuid, uuid, text) set search_path = public, pg_catalog;
  end if;
end $$;

alter table public.customers enable row level security;
alter table public.customer_merge_suggestions enable row level security;
alter table public.customer_merges enable row level security;
alter table public.customer_orders enable row level security;
alter table public.organizations enable row level security;
alter table public.user_profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.stores enable row level security;
alter table public.store_platforms enable row level security;
alter table public.store_ai_config enable row level security;
alter table public.store_products enable row level security;
alter table public.store_product_sync_state enable row level security;

revoke all on table
  public.customers,
  public.customer_merge_suggestions,
  public.customer_merges,
  public.customer_orders,
  public.organizations,
  public.user_profiles,
  public.conversations,
  public.messages,
  public.stores,
  public.store_platforms,
  public.store_ai_config,
  public.store_products,
  public.store_product_sync_state
from anon;

revoke all on table
  public.customers,
  public.customer_merge_suggestions,
  public.customer_merges,
  public.customer_orders,
  public.organizations,
  public.user_profiles,
  public.conversations,
  public.messages,
  public.stores,
  public.store_platforms,
  public.store_ai_config,
  public.store_products,
  public.store_product_sync_state
from public;

grant usage on schema public to authenticated;

grant select, insert, update, delete on table
  public.customers,
  public.customer_merge_suggestions,
  public.customer_merges,
  public.customer_orders,
  public.conversations,
  public.messages,
  public.stores,
  public.store_platforms
to authenticated;

grant select on table public.organizations to authenticated;
grant select on table public.user_profiles to authenticated;
grant update (
  full_name,
  display_name,
  avatar_url,
  notification_preferences,
  preferences
) on public.user_profiles to authenticated;

drop policy if exists allow_all_conversations on public.conversations;
drop policy if exists allow_all_messages on public.messages;
drop policy if exists allow_all_stores on public.stores;
drop policy if exists allow_all_store_platforms on public.store_platforms;

drop policy if exists organizations_select_own_org on public.organizations;
create policy organizations_select_own_org
on public.organizations
for select
to authenticated
using (id = (select private.auth_org_id()));

drop policy if exists user_profiles_select_own_org on public.user_profiles;
create policy user_profiles_select_own_org
on public.user_profiles
for select
to authenticated
using (organization_id = (select private.auth_org_id()));

drop policy if exists user_profiles_update_own_profile on public.user_profiles;
create policy user_profiles_update_own_profile
on public.user_profiles
for update
to authenticated
using (
  id = auth.uid()
  and organization_id = (select private.auth_org_id())
)
with check (
  id = auth.uid()
  and organization_id = (select private.auth_org_id())
);

drop policy if exists user_profiles_update_org_members on public.user_profiles;
create policy user_profiles_update_org_members
on public.user_profiles
for update
to authenticated
using (
  organization_id = (select private.auth_org_id())
  and (select private.auth_is_org_owner())
)
with check (organization_id = (select private.auth_org_id()));

drop policy if exists customers_select_own_org on public.customers;
create policy customers_select_own_org
on public.customers
for select
to authenticated
using (organization_id = (select private.auth_org_id()));

drop policy if exists customers_insert_own_org on public.customers;
create policy customers_insert_own_org
on public.customers
for insert
to authenticated
with check (organization_id = (select private.auth_org_id()));

drop policy if exists customers_update_own_org on public.customers;
create policy customers_update_own_org
on public.customers
for update
to authenticated
using (organization_id = (select private.auth_org_id()))
with check (organization_id = (select private.auth_org_id()));

drop policy if exists customers_delete_own_org on public.customers;
create policy customers_delete_own_org
on public.customers
for delete
to authenticated
using (organization_id = (select private.auth_org_id()));

drop policy if exists customer_merge_suggestions_select_own_org on public.customer_merge_suggestions;
create policy customer_merge_suggestions_select_own_org
on public.customer_merge_suggestions
for select
to authenticated
using (organization_id = (select private.auth_org_id()));

drop policy if exists customer_merge_suggestions_insert_own_org on public.customer_merge_suggestions;
create policy customer_merge_suggestions_insert_own_org
on public.customer_merge_suggestions
for insert
to authenticated
with check (organization_id = (select private.auth_org_id()));

drop policy if exists customer_merge_suggestions_update_own_org on public.customer_merge_suggestions;
create policy customer_merge_suggestions_update_own_org
on public.customer_merge_suggestions
for update
to authenticated
using (organization_id = (select private.auth_org_id()))
with check (organization_id = (select private.auth_org_id()));

drop policy if exists customer_merge_suggestions_delete_own_org on public.customer_merge_suggestions;
create policy customer_merge_suggestions_delete_own_org
on public.customer_merge_suggestions
for delete
to authenticated
using (organization_id = (select private.auth_org_id()));

drop policy if exists customer_merges_select_own_org on public.customer_merges;
create policy customer_merges_select_own_org
on public.customer_merges
for select
to authenticated
using (organization_id = (select private.auth_org_id()));

drop policy if exists customer_merges_insert_own_org on public.customer_merges;
create policy customer_merges_insert_own_org
on public.customer_merges
for insert
to authenticated
with check (organization_id = (select private.auth_org_id()));

drop policy if exists customer_merges_update_own_org on public.customer_merges;
create policy customer_merges_update_own_org
on public.customer_merges
for update
to authenticated
using (organization_id = (select private.auth_org_id()))
with check (organization_id = (select private.auth_org_id()));

drop policy if exists customer_merges_delete_own_org on public.customer_merges;
create policy customer_merges_delete_own_org
on public.customer_merges
for delete
to authenticated
using (organization_id = (select private.auth_org_id()));

drop policy if exists customer_orders_select_own_org on public.customer_orders;
create policy customer_orders_select_own_org
on public.customer_orders
for select
to authenticated
using (organization_id = (select private.auth_org_id()));

drop policy if exists customer_orders_insert_own_org on public.customer_orders;
create policy customer_orders_insert_own_org
on public.customer_orders
for insert
to authenticated
with check (organization_id = (select private.auth_org_id()));

drop policy if exists customer_orders_update_own_org on public.customer_orders;
create policy customer_orders_update_own_org
on public.customer_orders
for update
to authenticated
using (organization_id = (select private.auth_org_id()))
with check (organization_id = (select private.auth_org_id()));

drop policy if exists customer_orders_delete_own_org on public.customer_orders;
create policy customer_orders_delete_own_org
on public.customer_orders
for delete
to authenticated
using (organization_id = (select private.auth_org_id()));

drop policy if exists conversations_select_own_org on public.conversations;
create policy conversations_select_own_org
on public.conversations
for select
to authenticated
using (organization_id = (select private.auth_org_id()));

drop policy if exists conversations_insert_own_org on public.conversations;
create policy conversations_insert_own_org
on public.conversations
for insert
to authenticated
with check (organization_id = (select private.auth_org_id()));

drop policy if exists conversations_update_own_org on public.conversations;
create policy conversations_update_own_org
on public.conversations
for update
to authenticated
using (organization_id = (select private.auth_org_id()))
with check (organization_id = (select private.auth_org_id()));

drop policy if exists conversations_delete_own_org on public.conversations;
create policy conversations_delete_own_org
on public.conversations
for delete
to authenticated
using (organization_id = (select private.auth_org_id()));

drop policy if exists messages_select_own_org on public.messages;
create policy messages_select_own_org
on public.messages
for select
to authenticated
using (organization_id = (select private.auth_org_id()));

drop policy if exists messages_insert_own_org on public.messages;
create policy messages_insert_own_org
on public.messages
for insert
to authenticated
with check (organization_id = (select private.auth_org_id()));

drop policy if exists messages_update_own_org on public.messages;
create policy messages_update_own_org
on public.messages
for update
to authenticated
using (organization_id = (select private.auth_org_id()))
with check (organization_id = (select private.auth_org_id()));

drop policy if exists messages_delete_own_org on public.messages;
create policy messages_delete_own_org
on public.messages
for delete
to authenticated
using (organization_id = (select private.auth_org_id()));

drop policy if exists stores_select_own_org on public.stores;
create policy stores_select_own_org
on public.stores
for select
to authenticated
using (organization_id = (select private.auth_org_id()));

drop policy if exists stores_insert_own_org on public.stores;
create policy stores_insert_own_org
on public.stores
for insert
to authenticated
with check (organization_id = (select private.auth_org_id()));

drop policy if exists stores_update_own_org on public.stores;
create policy stores_update_own_org
on public.stores
for update
to authenticated
using (organization_id = (select private.auth_org_id()))
with check (organization_id = (select private.auth_org_id()));

drop policy if exists stores_delete_own_org on public.stores;
create policy stores_delete_own_org
on public.stores
for delete
to authenticated
using (organization_id = (select private.auth_org_id()));

drop policy if exists store_platforms_select_own_org on public.store_platforms;
create policy store_platforms_select_own_org
on public.store_platforms
for select
to authenticated
using (organization_id = (select private.auth_org_id()));

drop policy if exists store_platforms_insert_own_org on public.store_platforms;
create policy store_platforms_insert_own_org
on public.store_platforms
for insert
to authenticated
with check (organization_id = (select private.auth_org_id()));

drop policy if exists store_platforms_update_own_org on public.store_platforms;
create policy store_platforms_update_own_org
on public.store_platforms
for update
to authenticated
using (organization_id = (select private.auth_org_id()))
with check (organization_id = (select private.auth_org_id()));

drop policy if exists store_platforms_delete_own_org on public.store_platforms;
create policy store_platforms_delete_own_org
on public.store_platforms
for delete
to authenticated
using (organization_id = (select private.auth_org_id()));

drop policy if exists store_ai_config_select_own_org on public.store_ai_config;
drop policy if exists store_ai_config_insert_own_org on public.store_ai_config;
drop policy if exists store_ai_config_update_own_org on public.store_ai_config;
drop policy if exists store_ai_config_delete_own_org on public.store_ai_config;
drop policy if exists store_products_select_own_org on public.store_products;
drop policy if exists store_products_insert_own_org on public.store_products;
drop policy if exists store_products_update_own_org on public.store_products;
drop policy if exists store_products_delete_own_org on public.store_products;
drop policy if exists store_product_sync_state_select_own_org on public.store_product_sync_state;
drop policy if exists store_product_sync_state_insert_own_org on public.store_product_sync_state;
drop policy if exists store_product_sync_state_update_own_org on public.store_product_sync_state;
drop policy if exists store_product_sync_state_delete_own_org on public.store_product_sync_state;
