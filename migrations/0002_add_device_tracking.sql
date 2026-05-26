-- Migration: device tracking and suspicious login reports
-- Enables new-device detection, SMS alerts, and account review flagging

CREATE TABLE IF NOT EXISTS known_devices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT        NOT NULL,
  fingerprint   TEXT        NOT NULL,
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, fingerprint)
);

CREATE TABLE IF NOT EXISTS suspicious_login_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT        NOT NULL,
  fingerprint  TEXT        NOT NULL,
  reported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed     BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_known_devices_user ON known_devices (user_id);
CREATE INDEX IF NOT EXISTS idx_suspicious_reports_reviewed ON suspicious_login_reports (reviewed) WHERE reviewed = FALSE;
