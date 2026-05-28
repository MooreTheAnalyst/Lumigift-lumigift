-- Migration: normalize phone numbers to E.164 and add unique constraint
-- Issue: duplicate accounts possible when same number entered in different formats

-- 1. Ensure the users table has a phone column (no-op if it already exists).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- 2. Normalize any existing Nigerian numbers stored without the + prefix or with
--    a leading 0 so the unique constraint below doesn't reject valid existing rows.
UPDATE users
SET phone = CASE
  -- 2348XXXXXXXXX → +2348XXXXXXXXX
  WHEN phone ~ '^234[0-9]{10}$'  THEN '+' || phone
  -- 08XXXXXXXXX → +2348XXXXXXXXX
  WHEN phone ~ '^0[0-9]{10}$'    THEN '+234' || substring(phone FROM 2)
  -- 8XXXXXXXXX (10 digits, no leading 0) → +2348XXXXXXXXX
  WHEN phone ~ '^[1-9][0-9]{9}$' THEN '+234' || phone
  ELSE phone
END
WHERE phone IS NOT NULL
  AND phone NOT LIKE '+%';

-- 3. Enforce E.164 format going forward.
ALTER TABLE users
  ADD CONSTRAINT users_phone_e164_check
  CHECK (phone ~ '^\+[1-9][0-9]{9,14}$');

-- 4. Unique constraint prevents duplicate accounts for the same number.
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique
  ON users (phone);
