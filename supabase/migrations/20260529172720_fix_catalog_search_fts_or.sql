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
set search_path = public, pg_temp
as $$
declare
  v_tsquery tsquery;
begin
  -- Build an OR-based tsquery from the stemmed input lexemes so one bad token
  -- cannot force otherwise relevant catalog matches to zero results.
  select string_agg(quote_literal(lexeme), ' | ')::tsquery
  into v_tsquery
  from unnest(to_tsvector('english', p_query)) as token(lexeme, positions, weights);

  if v_tsquery is null then
    return;
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
    and sp.search_vector @@ v_tsquery
  order by
    ts_rank(sp.search_vector, v_tsquery) desc
  limit p_limit;
end;
$$;
