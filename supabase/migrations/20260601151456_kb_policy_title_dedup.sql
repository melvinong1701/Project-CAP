with ranked_policy_titles as (
  select
    id,
    row_number() over (
      partition by organization_id, store_id, lower(btrim(title))
      order by updated_at desc, id desc
    ) as title_rank
  from public.store_knowledge
  where kind = 'policy'
)
delete from public.store_knowledge sk
using ranked_policy_titles rpt
where sk.id = rpt.id
  and rpt.title_rank > 1;

create unique index if not exists store_knowledge_policy_title_uq
  on public.store_knowledge (organization_id, store_id, lower(btrim(title)))
  where kind = 'policy';
