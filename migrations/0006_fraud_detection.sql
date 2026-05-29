-- Migration: add fraud detection tables
-- Issue #404: Implement fraud detection for suspicious gift patterns

CREATE TABLE IF NOT EXISTS fraud_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  flag_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  metadata JSONB,
  reviewed BOOLEAN NOT NULL DEFAULT false,
  reviewed_by TEXT,
  review_action TEXT CHECK (review_action IN ('approved', 'rejected')),
  review_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_fraud_flags_gift_id ON fraud_flags(gift_id);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_user_id ON fraud_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_reviewed ON fraud_flags(reviewed) WHERE reviewed = false;
CREATE INDEX IF NOT EXISTS idx_fraud_flags_severity ON fraud_flags(severity, created_at DESC);

COMMENT ON TABLE fraud_flags IS 'Fraud detection flags for gifts requiring manual review';
COMMENT ON COLUMN fraud_flags.flag_type IS 'Type of fraud pattern detected: rapid_gifts, large_amount, new_account, etc.';
COMMENT ON COLUMN fraud_flags.severity IS 'Severity level: low, medium, high';
COMMENT ON COLUMN fraud_flags.metadata IS 'Additional context: gift count, time window, amounts, etc.';
