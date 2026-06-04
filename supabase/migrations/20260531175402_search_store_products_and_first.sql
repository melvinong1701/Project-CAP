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

  -- Set the word-similarity threshold used by the %> operator for this
  -- statement only (LOCAL). The function-level SET form is rejected with
  -- "permission denied to set parameter" outside the extension-creation txn.
  perform set_config('pg_trgm.word_similarity_threshold', v_trgm_threshold::text, true);

  select
    string_agg(quote_literal(lexeme), ' & ')::tsquery,
    string_agg(quote_literal(lexeme), ' | ')::tsquery
  into v_and_tsquery, v_or_tsquery
  from unnest(to_tsvector('english', v_clean_query)) as token(lexeme, positions, weights);

  -- Tier 1: precise match. Multi-term queries must match every lexeme.
  if v_and_tsquery is not null then
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
      and lower(sp.status) = 'active'
      and sp.search_vector @@ v_and_tsquery
    order by
      ts_rank(sp.search_vector, v_and_tsquery) desc
    limit p_limit;

    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      return;
    end if;
  end if;

  -- Tier 2: recall match. Only used when no precise FTS result exists.
  if v_or_tsquery is not null then
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
      and lower(sp.status) = 'active'
      and sp.search_vector @@ v_or_tsquery
    order by
      ts_rank(sp.search_vector, v_or_tsquery) desc
    limit p_limit;

    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      return;
    end if;
  end if;

  -- Tier 3: fuzzy typo fallback. Only used when FTS finds nothing.
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
    and lower(sp.status) = 'active'
    and sp.search_text %> v_clean_query
    and word_similarity(v_clean_query, sp.search_text) >= v_trgm_threshold
  order by
    word_similarity(v_clean_query, sp.search_text) desc
  limit p_limit;
end;
$$;
