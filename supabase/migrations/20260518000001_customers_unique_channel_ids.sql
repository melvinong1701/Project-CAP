drop index if exists customers_org_telegram_id_key;
drop index if exists customers_org_shopee_buyer_id_key;
drop index if exists customers_org_lazada_buyer_id_key;
drop index if exists customers_org_tiktok_buyer_id_key;

create unique index if not exists customers_org_telegram_id_key
  on customers (organization_id, telegram_id);

create unique index if not exists customers_org_shopee_buyer_id_key
  on customers (organization_id, shopee_buyer_id);

create unique index if not exists customers_org_lazada_buyer_id_key
  on customers (organization_id, lazada_buyer_id);

create unique index if not exists customers_org_tiktok_buyer_id_key
  on customers (organization_id, tiktok_buyer_id);
