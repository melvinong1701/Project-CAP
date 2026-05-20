alter table store_products
  add column if not exists search_vector tsvector;

update store_products
set search_vector = to_tsvector(
  'english',
  coalesce(title, '') || ' ' ||
  coalesce(description, '') || ' ' ||
  coalesce(product_type, '') || ' ' ||
  coalesce(array_to_string(tags, ' '), '')
);

create index if not exists store_products_search_vector_idx
  on store_products using gin(search_vector);

create or replace function store_products_search_vector_update()
returns trigger
language plpgsql
as $$
begin
  new.search_vector := to_tsvector(
    'english',
    coalesce(new.title, '') || ' ' ||
    coalesce(new.description, '') || ' ' ||
    coalesce(new.product_type, '') || ' ' ||
    coalesce(array_to_string(new.tags, ' '), '')
  );
  return new;
end;
$$;

drop trigger if exists store_products_search_vector_trigger on store_products;

create trigger store_products_search_vector_trigger
  before insert or update on store_products
  for each row execute function store_products_search_vector_update();
