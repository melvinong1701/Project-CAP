-- Strip leading "+" from E.164-formatted phone numbers already in the DB.
-- This covers the +65, +60, +62, +852, +66, +63, +84 prefixes in use
-- for SG, MY, ID, HK, TH, PH, VN markets.
-- Numbers without a leading "+" are left untouched.
UPDATE customers
SET phone = SUBSTRING(phone FROM 2)
WHERE phone IS NOT NULL
  AND phone LIKE '+%'
  AND phone ~ '^\\+[0-9]+$';
