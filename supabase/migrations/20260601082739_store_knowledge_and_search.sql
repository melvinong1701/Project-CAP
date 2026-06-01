create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

set search_path = public, extensions;

create table if not exists public.store_knowledge (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null,
  kind text not null check (kind in ('policy', 'faq')),
  title text not null,
  body text not null,
  tags text[] not null default '{}',
  is_active boolean not null default true,
  search_vector tsvector not null default ''::tsvector,
  search_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.store_knowledge enable row level security;

revoke all on table public.store_knowledge from anon;
revoke all on table public.store_knowledge from public;

create index if not exists store_knowledge_org_store_idx
  on public.store_knowledge (organization_id, store_id);

create index if not exists store_knowledge_search_vector_idx
  on public.store_knowledge using gin(search_vector);

create index if not exists store_knowledge_search_text_trgm_idx
  on public.store_knowledge using gin (search_text gin_trgm_ops);

create or replace function public.store_knowledge_search_vector_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.search_text := concat_ws(
    ' ',
    new.kind,
    new.title,
    array_to_string(new.tags, ' '),
    new.body
  );

  new.search_vector := to_tsvector(
    'english',
    concat_ws(
      ' ',
      new.kind,
      new.title,
      array_to_string(new.tags, ' '),
      new.body
    )
  );

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists store_knowledge_search_vector_trigger on public.store_knowledge;

create trigger store_knowledge_search_vector_trigger
  before insert or update on public.store_knowledge
  for each row execute function public.store_knowledge_search_vector_update();

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

create or replace function public.search_store_knowledge(
  p_organization_id uuid,
  p_store_id uuid,
  p_query text,
  p_limit int default 4
)
returns table (
  kind text,
  title text,
  body text,
  tags text[]
)
language plpgsql
stable
set search_path = public, extensions, pg_temp
as $$
declare
  v_and_tsquery tsquery;
  v_or_tsquery tsquery;
  v_rows int := 0;
  v_clean_query text := btrim(coalesce(p_query, ''));
  v_trgm_threshold constant real := 0.3;
begin
  if v_clean_query = '' then
    return;
  end if;

  -- Keep this local to the RPC call; function-level SET is rejected in some
  -- Supabase extension contexts.
  perform set_config('pg_trgm.word_similarity_threshold', v_trgm_threshold::text, true);

  select
    string_agg(quote_literal(lexeme), ' & ')::tsquery,
    string_agg(quote_literal(lexeme), ' | ')::tsquery
  into v_and_tsquery, v_or_tsquery
  from unnest(to_tsvector('english', v_clean_query)) as token(lexeme, positions, weights);

  if v_and_tsquery is not null then
    return query
    select
      sk.kind,
      sk.title,
      sk.body,
      sk.tags
    from public.store_knowledge sk
    where
      sk.organization_id = p_organization_id
      and sk.store_id = p_store_id
      and sk.is_active = true
      and sk.search_vector @@ v_and_tsquery
    order by
      ts_rank(sk.search_vector, v_and_tsquery) desc
    limit p_limit;

    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      return;
    end if;
  end if;

  if v_or_tsquery is not null then
    return query
    select
      sk.kind,
      sk.title,
      sk.body,
      sk.tags
    from public.store_knowledge sk
    where
      sk.organization_id = p_organization_id
      and sk.store_id = p_store_id
      and sk.is_active = true
      and sk.search_vector @@ v_or_tsquery
    order by
      ts_rank(sk.search_vector, v_or_tsquery) desc
    limit p_limit;

    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      return;
    end if;
  end if;

  return query
  select
    sk.kind,
    sk.title,
    sk.body,
    sk.tags
  from public.store_knowledge sk
  where
    sk.organization_id = p_organization_id
    and sk.store_id = p_store_id
    and sk.is_active = true
    and sk.search_text %> v_clean_query
    and word_similarity(v_clean_query, sk.search_text) >= v_trgm_threshold
  order by
    word_similarity(v_clean_query, sk.search_text) desc
  limit p_limit;
end;
$$;
