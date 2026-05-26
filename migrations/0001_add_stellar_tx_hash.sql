-- Migration: add Stellar transaction hash columns to gifts table
-- Issue #41: Store funding and claim tx hashes for dispute resolution

ALTER TABLE gifts
  ADD COLUMN IF NOT EXISTS stellar_tx_hash  TEXT,
  ADD COLUMN IF NOT EXISTS claim_tx_hash    TEXT;

COMMENT ON COLUMN gifts.stellar_tx_hash IS 'Stellar transaction hash from the escrow initialize (funding) call';
COMMENT ON COLUMN gifts.claim_tx_hash    IS 'Stellar transaction hash from the escrow claim call';
