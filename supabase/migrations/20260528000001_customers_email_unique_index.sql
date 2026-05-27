create unique index if not exists customers_org_email_key
  on customers (organization_id, email)
  where email is not null;

create unique index if not exists customers_org_phone_key
  on customers (organization_id, phone)
  where phone is not null;
