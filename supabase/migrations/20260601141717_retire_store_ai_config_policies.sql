insert into public.store_knowledge (
  organization_id,
  store_id,
  kind,
  title,
  body,
  tags
)
select
  sac.organization_id,
  sac.store_id,
  'policy',
  'Return policy',
  btrim(sac.return_policy),
  array['returns', 'return policy']
from public.store_ai_config sac
where nullif(btrim(coalesce(sac.return_policy, '')), '') is not null
  and not exists (
    select 1
    from public.store_knowledge sk
    where sk.organization_id = sac.organization_id
      and sk.store_id = sac.store_id
      and sk.kind = 'policy'
      and sk.title = 'Return policy'
  );

insert into public.store_knowledge (
  organization_id,
  store_id,
  kind,
  title,
  body,
  tags
)
select
  sac.organization_id,
  sac.store_id,
  'policy',
  'Shipping policy',
  btrim(sac.shipping_policy),
  array['shipping', 'delivery', 'shipping policy']
from public.store_ai_config sac
where nullif(btrim(coalesce(sac.shipping_policy, '')), '') is not null
  and not exists (
    select 1
    from public.store_knowledge sk
    where sk.organization_id = sac.organization_id
      and sk.store_id = sac.store_id
      and sk.kind = 'policy'
      and sk.title = 'Shipping policy'
  );

alter table public.store_ai_config
  drop column return_policy,
  drop column shipping_policy;
