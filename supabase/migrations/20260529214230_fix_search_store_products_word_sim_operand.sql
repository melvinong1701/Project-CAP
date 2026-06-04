-- Recovered into the repo on 2026-06-04 during migration-history reconciliation.
-- This migration was applied directly to prod (via the dashboard/MCP) and never
-- had a corresponding repo file; reconstructed from the live function definition.
-- Superseded by 20260531175402_search_store_products_and_first.sql; kept for a
-- faithful, replayable history.

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
  v_tsquery tsquery;
  v_fts_rows int := 0;
  v_clean_query text := btrim(coalesce(p_query, ''));
  v_trgm_threshold constant real := 0.3;
begin
  if v_clean_query = '' then
    return;
  end if;

  -- Set the word-similarity threshold used by the %> operator for this
  -- statement only (LOCAL). Keep in sync with v_trgm_threshold.
  perform set_config('pg_trgm.word_similarity_threshold', v_trgm_threshold::text, true);

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

  -- Fuzzy fallback: word_similarity(query, search_text) measures the query
  -- against the best-matching word-extent of the (longer) product text.
  -- The index operator for that direction is: search_text %> query.
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
    and sp.search_text %> v_clean_query
    and word_similarity(v_clean_query, sp.search_text) >= v_trgm_threshold
  order by
    word_similarity(v_clean_query, sp.search_text) desc
  limit p_limit;
end;
$$;
