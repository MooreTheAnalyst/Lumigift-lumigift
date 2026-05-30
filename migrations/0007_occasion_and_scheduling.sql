-- Migration: add occasion category and scheduled notification time
-- Issues #414 (occasion categories) and #416 (gift scheduling)

ALTER TABLE gifts
  ADD COLUMN IF NOT EXISTS occasion TEXT NOT NULL DEFAULT 'general'
    CHECK (occasion IN ('general','birthday','valentine','anniversary','graduation','christmas')),
  ADD COLUMN IF NOT EXISTS notify_at TIMESTAMPTZ;

COMMENT ON COLUMN gifts.occasion IS 'Occasion theme for the gift reveal page';
COMMENT ON COLUMN gifts.notify_at IS 'Scheduled time to send the recipient notification SMS; NULL means send immediately on funding';

CREATE INDEX IF NOT EXISTS idx_gifts_notify_at
  ON gifts(notify_at)
  WHERE notify_at IS NOT NULL AND status IN ('funded','locked');
