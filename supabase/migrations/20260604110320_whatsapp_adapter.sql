alter table customers
  add column if not exists whatsapp_id text;

comment on column customers.whatsapp_id is
  'Opaque WhatsApp user identifier. Stores Cloud API wa_id during test phase; future BSUID support should use an additive column.';

create unique index if not exists customers_org_whatsapp_id_key
  on customers (organization_id, whatsapp_id);

alter table store_platforms
  add column if not exists wa_phone_number_id text,
  add column if not exists wa_access_token text;

comment on column store_platforms.wa_phone_number_id is
  'Meta WhatsApp Cloud API phone_number_id used to demultiplex the shared webhook.';

comment on column store_platforms.wa_access_token is
  'WhatsApp Cloud API access token for this store connection.';

create unique index if not exists store_platforms_wa_phone_number_id_key
  on store_platforms (wa_phone_number_id)
  where wa_phone_number_id is not null;
