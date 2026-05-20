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
language sql
stable
as $$
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
    and sp.search_vector @@ plainto_tsquery('english', p_query)
  order by
    ts_rank(sp.search_vector, plainto_tsquery('english', p_query)) desc
  limit p_limit;
$$;
