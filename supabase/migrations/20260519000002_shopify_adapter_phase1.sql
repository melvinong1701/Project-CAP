alter table store_platforms
  add column if not exists access_token text,
  add column if not exists shopify_domain text;
