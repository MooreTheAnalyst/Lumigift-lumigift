-- Migration: hash recipient phone numbers in gifts table
-- Issue #93: Storing recipient phone numbers in plaintext creates a PII liability.
-- The SHA-256 hash is sufficient for lookup; plaintext is only needed transiently for SMS.

-- 1. Add the hashed column.
ALTER TABLE gifts
  ADD COLUMN IF NOT EXISTS recipient_phone_hash TEXT;

COMMENT ON COLUMN gifts.recipient_phone_hash IS 'SHA-256 hex digest of the E.164 recipient phone number';

-- 2. Backfill existing rows: hash the plaintext value using pgcrypto.
--    encode(digest(value, 'sha256'), 'hex') requires the pgcrypto extension.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE gifts
SET recipient_phone_hash = encode(digest(recipient_phone, 'sha256'), 'hex')
WHERE recipient_phone IS NOT NULL
  AND recipient_phone_hash IS NULL;

-- 3. Make the hash column NOT NULL once backfilled.
ALTER TABLE gifts
  ALTER COLUMN recipient_phone_hash SET NOT NULL;

-- 4. Index for fast lookup by hash.
CREATE INDEX IF NOT EXISTS gifts_recipient_phone_hash_idx
  ON gifts (recipient_phone_hash);

-- 5. Drop the plaintext column.
ALTER TABLE gifts
  DROP COLUMN IF EXISTS recipient_phone;
