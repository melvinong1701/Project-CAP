create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

set search_path = public, extensions;

alter table store_products
  add column if not exists search_text text not null default '';

create or replace function store_products_variant_titles(p_variants jsonb)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(string_agg(nullif(variant->>'title', ''), ' '), '')
  from jsonb_array_elements(
    case
      when jsonb_typeof(coalesce(p_variants, '[]'::jsonb)) = 'array'
        then coalesce(p_variants, '[]'::jsonb)
      else '[]'::jsonb
    end
  ) as variant
  where nullif(variant->>'title', '') is not null;
$$;

create or replace function store_products_search_vector_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_variant_titles text := store_products_variant_titles(new.variants);
begin
  new.search_text := concat_ws(
    ' ',
    new.title,
    new.product_type,
    array_to_string(new.tags, ' '),
    v_variant_titles
  );

  new.search_vector := to_tsvector(
    'english',
    concat_ws(
      ' ',
      new.title,
      new.description,
      new.product_type,
      array_to_string(new.tags, ' '),
      v_variant_titles
    )
  );

  return new;
end;
$$;

update store_products
set
  search_text = concat_ws(
    ' ',
    title,
    product_type,
    array_to_string(tags, ' '),
    store_products_variant_titles(variants)
  ),
  search_vector = to_tsvector(
    'english',
    concat_ws(
      ' ',
      title,
      description,
      product_type,
      array_to_string(tags, ' '),
      store_products_variant_titles(variants)
    )
  );

create index if not exists store_products_search_text_trgm_idx
  on store_products using gin (search_text gin_trgm_ops);

create or replace function search_store_products(
  p_organization_id uuid,
  p_store_id uuid,
  p_query text,
  p_limit int default 4
)
returns table (
  title text,
  product_type text,
  tags text[],
  status text,
  variants jsonb
)
language plpgsql
stable
set search_path = public, extensions, pg_temp
set pg_trgm.word_similarity_threshold = '0.3'
as $$
declare
  v_tsquery tsquery;
  v_fts_rows int := 0;
  v_clean_query text := btrim(coalesce(p_query, ''));
  -- Keep in sync with the function-level pg_trgm.word_similarity_threshold SET clause.
  v_trgm_threshold constant real := 0.3;
begin
  if v_clean_query = '' then
    return;
  end if;

  -- Build an OR-based tsquery from the stemmed input lexemes so one bad token
  -- cannot force otherwise relevant catalog matches to zero results.
  select string_agg(quote_literal(lexeme), ' | ')::tsquery
  into v_tsquery
  from unnest(to_tsvector('english', v_clean_query)) as token(lexeme, positions, weights);

  if v_tsquery is not null then
    return query
    select
      sp.title,
      sp.product_type,
      sp.tags,
      sp.status,
      sp.variants
    from store_products sp
    where
      sp.organization_id = p_organization_id
      and sp.store_id = p_store_id
      and sp.search_vector @@ v_tsquery
    order by
      ts_rank(sp.search_vector, v_tsquery) desc
    limit p_limit;

    get diagnostics v_fts_rows = row_count;
    if v_fts_rows > 0 then
      return;
    end if;
  end if;

  return query
  select
    sp.title,
    sp.product_type,
    sp.tags,
    sp.status,
    sp.variants
  from store_products sp
  where
    sp.organization_id = p_organization_id
    and sp.store_id = p_store_id
    and v_clean_query %> sp.search_text
    and word_similarity(v_clean_query, sp.search_text) >= v_trgm_threshold
  order by
    word_similarity(v_clean_query, sp.search_text) desc
  limit p_limit;
end;
$$;
