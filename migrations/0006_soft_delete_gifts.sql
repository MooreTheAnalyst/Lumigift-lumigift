-- Migration: soft delete for gifts
-- Issue #333: Implement soft delete for gifts instead of hard delete

ALTER TABLE gifts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_gifts_deleted_at ON gifts(deleted_at) WHERE deleted_at IS NULL;

COMMENT ON COLUMN gifts.deleted_at IS 'Soft delete timestamp. NULL means the record is active. Set to NOW() to soft-delete.';
