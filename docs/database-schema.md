# Database Schema

PostgreSQL schema for Lumigift. Six tables covering users, gifts, invitations, device security, and audit logging.

---

## ER Diagram

```
┌─────────────────────────────────┐
│             users               │
│─────────────────────────────────│
│ id (PK)          TEXT           │
│ phone            TEXT UNIQUE    │◄──────────────────────────────────────┐
│ display_name     TEXT           │                                       │
│ created_at       TIMESTAMPTZ    │                                       │
│ updated_at       TIMESTAMPTZ    │                                       │
└─────────────────────────────────┘                                       │
         │                                                                 │
         │ sender_id                                                       │
         ▼                                                                 │
┌─────────────────────────────────┐       ┌──────────────────────────────┐│
│             gifts               │       │       known_devices          ││
│─────────────────────────────────│       │──────────────────────────────││
│ id (PK)          TEXT           │       │ id (PK)      UUID            ││
│ sender_id        TEXT ──────────┼──────►│ user_id      TEXT ───────────┘│
│ recipient_phone_hash  TEXT      │       │ fingerprint  TEXT            │
│ recipient_name   TEXT           │       │ last_seen_at TIMESTAMPTZ     │
│ amount_ngn       NUMERIC        │       │ created_at   TIMESTAMPTZ     │
│ amount_usdc      TEXT           │       └──────────────────────────────┘
│ status           TEXT           │
│ unlock_at        TIMESTAMPTZ    │       ┌──────────────────────────────┐
│ stellar_tx_hash  TEXT           │       │  suspicious_login_reports    │
│ claim_tx_hash    TEXT           │       │──────────────────────────────│
│ created_at       TIMESTAMPTZ    │       │ id (PK)      UUID            │
│ updated_at       TIMESTAMPTZ    │       │ user_id      TEXT            │
└─────────────────────────────────┘       │ fingerprint  TEXT            │
         │                                │ reported_at  TIMESTAMPTZ     │
         │ gift_id (FK, CASCADE)          │ reviewed     BOOLEAN         │
         ▼                                └──────────────────────────────┘
┌─────────────────────────────────┐
│       gift_invitations          │       ┌──────────────────────────────┐
│─────────────────────────────────│       │         audit_logs           │
│ id (PK)          TEXT           │       │──────────────────────────────│
│ gift_id (FK)     TEXT ──────────┼──────►│ id (PK)      UUID            │
│ recipient_phone_hash  TEXT      │       │ event_type   TEXT            │
│ recipient_phone  TEXT           │       │ user_id      TEXT            │
│ token            TEXT UNIQUE    │       │ gift_id      TEXT            │
│ status           TEXT           │       │ amount_ngn   INTEGER         │
│ expires_at       TIMESTAMPTZ    │       │ amount_usdc  TEXT            │
│ created_at       TIMESTAMPTZ    │       │ timestamp    TIMESTAMPTZ     │
│ updated_at       TIMESTAMPTZ    │       │ ip_address   INET            │
└─────────────────────────────────┘       │ user_agent   TEXT            │
                                          │ metadata     JSONB           │
                                          │ created_at   TIMESTAMPTZ     │
                                          └──────────────────────────────┘
```

---

## Tables

### `users`

Registered users, identified by phone number (E.164 format).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Application-generated user ID |
| `phone` | TEXT | NOT NULL, UNIQUE | E.164 phone number (e.g. `+2348011111111`) |
| `display_name` | TEXT | NOT NULL | User's display name |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Account creation time |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last profile update |

**Indexes:**
- `users_phone_unique` — unique index on `phone` (prevents duplicate accounts for the same number)

---

### `gifts`

Core table. Each row is a time-locked cash gift from a sender to a recipient.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Application-generated gift ID |
| `sender_id` | TEXT | NOT NULL | References `users.id` (no FK constraint; soft reference) |
| `recipient_phone_hash` | TEXT | NOT NULL | SHA-256 hex digest of the recipient's E.164 phone number |
| `recipient_name` | TEXT | NOT NULL | Display name of the recipient |
| `amount_ngn` | NUMERIC | NOT NULL | Gift amount in Nigerian Naira (fiat) |
| `amount_usdc` | TEXT | NOT NULL | Equivalent USDC amount as a string (preserves on-chain precision) |
| `status` | TEXT | NOT NULL, DEFAULT `'pending_payment'` | Gift lifecycle state (see below) |
| `unlock_at` | TIMESTAMPTZ | NOT NULL | Date/time when the gift becomes claimable |
| `stellar_tx_hash` | TEXT | — | Stellar transaction hash from the escrow funding call |
| `claim_tx_hash` | TEXT | — | Stellar transaction hash from the escrow claim call |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Gift creation time |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last status update |

**Gift status lifecycle:**
```
draft → pending_payment → funded → locked → unlocked → claimed
                                                      → expired
                        → cancelled
```

**Indexes:**
- `gifts_recipient_phone_hash_idx` — on `recipient_phone_hash` for fast recipient lookup

**Notes:**
- Recipient phone is never stored in plaintext. Only the SHA-256 hash is persisted (migration `0003`).
- `amount_usdc` is stored as TEXT to avoid floating-point precision loss for on-chain values.

---

### `gift_invitations`

Invitation tokens for gifts sent to recipients who are not yet registered.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Application-generated invitation ID |
| `gift_id` | TEXT | NOT NULL, FK → `gifts.id` CASCADE | The gift this invitation is for |
| `recipient_phone_hash` | TEXT | NOT NULL | SHA-256 hash of the recipient's phone |
| `recipient_phone` | TEXT | NOT NULL | Plaintext phone (needed transiently to send the SMS invite) |
| `token` | TEXT | NOT NULL, UNIQUE | Secure random token embedded in the claim link (valid 30 days) |
| `status` | TEXT | NOT NULL, DEFAULT `'pending'` | `pending` → `accepted` → `claimed` or `expired` |
| `expires_at` | TIMESTAMPTZ | NOT NULL | Token expiry (30 days after creation) |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | — |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | — |

**Indexes:**
- `idx_gift_invitations_token` — on `token` for O(1) claim-link lookup
- `idx_gift_invitations_gift_id` — on `gift_id` for gift → invitations lookup
- `idx_gift_invitations_recipient_phone_hash` — on `recipient_phone_hash` for recipient lookup

**Foreign keys:**
- `fk_gift_invitations_gift_id`: `gift_id` → `gifts(id)` ON DELETE CASCADE (invitation is deleted when the gift is deleted)

---

### `known_devices`

Trusted device fingerprints per user, used for new-device detection.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | — |
| `user_id` | TEXT | NOT NULL | References `users.id` |
| `fingerprint` | TEXT | NOT NULL | Browser/device fingerprint hash |
| `last_seen_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last login from this device |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | First time device was trusted |

**Constraints:**
- `UNIQUE (user_id, fingerprint)` — a device is registered once per user

**Indexes:**
- `idx_known_devices_user` — on `user_id` for fast per-user device lookup

---

### `suspicious_login_reports`

Login attempts from unrecognised devices that were flagged for review.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | — |
| `user_id` | TEXT | NOT NULL | References `users.id` |
| `fingerprint` | TEXT | NOT NULL | The unrecognised device fingerprint |
| `reported_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | When the suspicious login occurred |
| `reviewed` | BOOLEAN | NOT NULL, DEFAULT FALSE | Whether an admin has reviewed this report |

**Indexes:**
- `idx_suspicious_reports_reviewed` — partial index on `reviewed = FALSE` for fast unreviewed-report queries

---

### `audit_logs`

Append-only audit trail for all financial operations. Retained for compliance (minimum 7 years).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | — |
| `event_type` | TEXT | NOT NULL | `gift_created`, `payment_received`, `gift_funded`, `gift_claimed`, `gift_cancelled` |
| `user_id` | TEXT | — | Acting user (nullable for system events) |
| `gift_id` | TEXT | — | Related gift (nullable) |
| `amount_ngn` | INTEGER | — | NGN amount involved |
| `amount_usdc` | TEXT | — | USDC amount involved |
| `timestamp` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Event time |
| `ip_address` | INET | — | Client IP address |
| `user_agent` | TEXT | — | Client user-agent string |
| `metadata` | JSONB | — | Additional context (payment provider, tx hashes, error details) |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Row insertion time |

**Indexes:**
- `idx_audit_logs_user_id` — on `user_id`
- `idx_audit_logs_gift_id` — on `gift_id`
- `idx_audit_logs_timestamp` — on `timestamp` for time-range queries
- `idx_audit_logs_event_type` — on `event_type` for event-type filtering

**Append-only enforcement:**
PostgreSQL rules `audit_logs_no_update` and `audit_logs_no_delete` silently discard any UPDATE or DELETE against this table.

---

## Relationships Summary

| From | Column | To | Type |
|------|--------|----|------|
| `gifts` | `sender_id` | `users.id` | Many-to-one (soft reference) |
| `gift_invitations` | `gift_id` | `gifts.id` | Many-to-one (FK, CASCADE DELETE) |
| `known_devices` | `user_id` | `users.id` | Many-to-one (soft reference) |
| `suspicious_login_reports` | `user_id` | `users.id` | Many-to-one (soft reference) |
| `audit_logs` | `user_id` | `users.id` | Many-to-one (soft reference, nullable) |
| `audit_logs` | `gift_id` | `gifts.id` | Many-to-one (soft reference, nullable) |

> Soft references: the application enforces referential integrity in code rather than via a database FK constraint, to allow audit logs and device records to survive user deletion.

---

## Migration History

| File | Description |
|------|-------------|
| `seed-test-db.ts` | Base schema: `users`, `gifts`, `gift_invitations` |
| `0001_add_stellar_tx_hash.sql` | Adds `stellar_tx_hash`, `claim_tx_hash` to `gifts` |
| `0002_add_device_tracking.sql` | Creates `known_devices`, `suspicious_login_reports` |
| `0002_normalize_phone_e164.sql` | Normalises `users.phone` to E.164, adds unique index |
| `0003_hash_recipient_phone.sql` | Adds `recipient_phone_hash` to `gifts`, drops plaintext `recipient_phone` |
| `0004_gift_invitations.sql` | Creates `gift_invitations` with FK and indexes |
| `0005_audit_logs.sql` | Creates `audit_logs` with append-only rules |

---

## Updating This Document

Update this file whenever a new migration is added:
1. Add the migration to the **Migration History** table.
2. Update the affected table section(s).
3. Update the ER diagram if columns or relationships changed.
