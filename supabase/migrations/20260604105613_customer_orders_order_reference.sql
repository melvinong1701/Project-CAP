alter table customer_orders
  add column if not exists order_reference text;

update customer_orders
set order_reference = raw_payload->>'name'
where order_reference is null
  and channel = 'shopify'
  and raw_payload ? 'name';
