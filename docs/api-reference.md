# Lumigift API Reference

> Base URL: `https://www.lumigift.com`  
> All endpoints are prefixed with `/api/v1` unless noted otherwise.

---

## Authentication

Most endpoints require a valid **NextAuth.js session cookie** obtained by completing the phone OTP flow:

1. `POST /api/v1/auth/send-otp` — request an OTP
2. Sign in via NextAuth credentials with the OTP (`POST /api/v1/auth/[...nextauth]`)

Endpoints that mutate state also require a **CSRF token** in the `x-csrf-token` request header. Fetch it from `GET /api/v1/csrf`.

**Cron endpoints** use a `Bearer <CRON_SECRET>` `Authorization` header instead of a session.

---

## Common Response Shapes

### Success

```json
{ "success": true, "data": { ... } }
```

### Error

```json
{ "success": false, "error": "Human-readable message", "code": "OPTIONAL_CODE" }
```

### Validation Error (400)

```json
{
  "success": false,
  "error": "Validation failed",
  "errors": [{ "path": "fieldName", "message": "What went wrong" }]
}
```

---

## Auth

### `POST /api/v1/auth/send-otp`

Send a one-time password via SMS.

**Rate limits:** 3 requests per phone per 10 min; 10 per IP per hour.

**Request body**

| Field | Type   | Required | Description                                  |
|-------|--------|----------|----------------------------------------------|
| phone | string | ✓        | Phone number (any format; normalised to E.164) |

**Responses**

| Status | Description                                                  |
|--------|--------------------------------------------------------------|
| 200    | OTP sent (or silently dropped if number is not registered)   |
| 400    | Validation error                                             |
| 429    | Rate limit exceeded                                          |

**Example**

```bash
curl -X POST https://www.lumigift.com/api/v1/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+2348012345678"}'
```

```json
{ "success": true, "data": { "message": "If this number is registered, an OTP has been sent." } }
```

---

### `POST /api/v1/auth/register`

Register a new user account.

**Request body**

| Field | Type   | Required | Description              |
|-------|--------|----------|--------------------------|
| phone | string | ✓        | E.164 phone number       |
| otp   | string | ✓        | 6-digit OTP              |
| name  | string | ✓        | Display name (2–60 chars)|

**Responses**

| Status | Description                        |
|--------|------------------------------------|
| 201    | Account created                    |
| 400    | Validation error or invalid OTP    |
| 409    | Phone number already registered    |

**Example**

```bash
curl -X POST https://www.lumigift.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phone": "+2348012345678", "otp": "123456", "name": "Amara"}'
```

---

### `POST /api/v1/auth/verify-otp`

Verify an OTP (used internally by NextAuth credentials provider).

**Request body**

| Field | Type   | Required | Description        |
|-------|--------|----------|--------------------|
| phone | string | ✓        | E.164 phone number |
| otp   | string | ✓        | 6-digit OTP        |

**Responses**

| Status | Description                  |
|--------|------------------------------|
| 200    | OTP valid                    |
| 400    | Invalid or expired OTP       |
| 429    | Too many failed attempts     |

---

### `GET /api/v1/auth/report-login`

Report a suspicious login (called from the "this wasn't me" SMS link).

**Query parameters**

| Param | Type   | Required | Description       |
|-------|--------|----------|-------------------|
| uid   | string | ✓        | User ID           |
| fp    | string | ✓        | Device fingerprint|

**Responses**

| Status | Description     |
|--------|-----------------|
| 200    | Report recorded |
| 400    | Missing params  |

---

## Gifts

### `GET /api/v1/gifts`

List gifts sent by the authenticated user. Supports both offset-based and cursor-based pagination.

**Auth:** Session required.

**Query parameters (offset-based)**

| Param  | Type    | Default | Description                                                  |
|--------|---------|---------|--------------------------------------------------------------|
| page   | integer | 1       | Page number (≥ 1)                                            |
| limit  | integer | 10      | Items per page (1–100)                                       |
| status | string  | —       | Filter by status: `draft`, `pending_payment`, `funded`, `locked`, `unlocked`, `claimed`, `expired`, `cancelled` |

**Query parameters (cursor-based, legacy)**

| Param    | Type    | Default | Description                        |
|----------|---------|---------|------------------------------------|
| cursor   | string  | —       | ID of last gift from previous page |
| pageSize | integer | 10      | Items per page (1–100)             |

**Response (offset-based)**

```json
{
  "success": true,
  "data": {
    "data": [ { ...Gift } ],
    "total": 42,
    "page": 1,
    "limit": 10,
    "totalPages": 5,
    "counts": { "all": 42, "pending": 10, "claimed": 20, "expired": 2 }
  }
}
```

**Example**

```bash
curl "https://www.lumigift.com/api/v1/gifts?page=1&limit=10&status=claimed" \
  -H "Cookie: next-auth.session-token=<token>"
```

---

### `POST /api/v1/gifts`

Create a new gift and initialise a Paystack payment session.

**Auth:** Session + CSRF token required.

**Request body**

| Field                | Type    | Required | Description                                                                 |
|----------------------|---------|----------|-----------------------------------------------------------------------------|
| recipientPhone       | string  | ✓        | E.164 phone number of recipient                                             |
| recipientName        | string  | ✓        | Recipient's display name (2–100 chars)                                      |
| recipientEmail       | string  |          | Recipient's email (optional, for email notification)                        |
| amountNgn            | number  | ✓        | Gift amount in NGN (500–500,000)                                            |
| message              | string  |          | Personal message (max 280 chars)                                            |
| voiceNoteUrl         | string  |          | URL of uploaded voice note                                                  |
| unlockAt             | string  | ✓        | ISO 8601 datetime; must be in the future                                    |
| paymentProvider      | string  | ✓        | `"paystack"` or `"stripe"`                                                  |
| recipientIsRegistered| boolean |          | Whether recipient has a Lumigift account (default: `true`)                  |
| occasion             | string  |          | `"general"` \| `"birthday"` \| `"valentine"` \| `"anniversary"` \| `"graduation"` \| `"christmas"` (default: `"general"`) |
| notifyAt             | string  |          | ISO 8601 datetime to schedule the recipient notification SMS; must be ≤ `unlockAt` |

**Response (201)**

```json
{
  "success": true,
  "data": {
    "gift": { ...Gift },
    "paymentUrl": "https://checkout.paystack.com/..."
  }
}
```

**Errors**

| Status | Code / message                                |
|--------|-----------------------------------------------|
| 400    | Validation error                              |
| 401    | Unauthorized                                  |
| 403    | CSRF token missing or invalid                 |
| 422    | Daily sending limit exceeded                  |

**Example**

```bash
curl -X POST https://www.lumigift.com/api/v1/gifts \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: <csrf>" \
  -H "Cookie: next-auth.session-token=<token>" \
  -d '{
    "recipientPhone": "+2348012345678",
    "recipientName": "Amara",
    "amountNgn": 5000,
    "unlockAt": "2026-06-15T00:00:00.000Z",
    "paymentProvider": "paystack",
    "occasion": "birthday",
    "notifyAt": "2026-06-14T23:00:00.000Z"
  }'
```

---

### `GET /api/v1/gifts/:id`

Retrieve a single gift by ID. Returns a safe subset of fields (no sender PII) for the public claim page.

**Auth:** None required (public endpoint for recipient claim page).

**Path parameters**

| Param | Type   | Description |
|-------|--------|-------------|
| id    | string | Gift UUID   |

**Response (200)**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "recipientName": "Amara",
    "amountNgn": 5000,
    "message": "Happy birthday!",
    "unlockAt": "2026-06-15T00:00:00.000Z",
    "status": "locked"
  }
}
```

**Errors**

| Status | Description   |
|--------|---------------|
| 400    | Invalid UUID  |
| 404    | Gift not found|

**Example**

```bash
curl https://www.lumigift.com/api/v1/gifts/550e8400-e29b-41d4-a716-446655440000
```

---

### `DELETE /api/v1/gifts/:id`

Cancel a gift and trigger a Paystack refund. Only the sender can cancel, and only when the gift is in `locked` or `pending_payment` status and the unlock time has not yet passed.

**Auth:** Session + CSRF token required.

**Path parameters**

| Param | Type   | Description |
|-------|--------|-------------|
| id    | string | Gift UUID   |

**Response (200)**

```json
{ "success": true, "data": { ...Gift } }
```

**Errors**

| Status | Description                                      |
|--------|--------------------------------------------------|
| 401    | Unauthorized                                     |
| 403    | Forbidden (not the sender)                       |
| 404    | Gift not found                                   |
| 409    | Gift cannot be cancelled in its current state, or unlock time has passed |

**Example**

```bash
curl -X DELETE https://www.lumigift.com/api/v1/gifts/550e8400-e29b-41d4-a716-446655440000 \
  -H "x-csrf-token: <csrf>" \
  -H "Cookie: next-auth.session-token=<token>"
```

---

### `POST /api/v1/gifts/:id/claim`

Claim an unlocked gift by transferring USDC from the escrow contract to the recipient's Stellar address.

**Auth:** Session + CSRF token required. The authenticated user must be the intended recipient.

**Path parameters**

| Param | Type   | Description |
|-------|--------|-------------|
| id    | string | Gift UUID   |

**Request body**

| Field                | Type   | Required | Description                                    |
|----------------------|--------|----------|------------------------------------------------|
| giftId               | string | ✓        | Gift UUID (must match path param)              |
| recipientStellarKey  | string | ✓        | Recipient's Stellar public key (56-char G…)    |

**Response (200)**

```json
{ "success": true, "data": { "jobId": "queue-job-id" } }
```

**Errors**

| Status | Description                                              |
|--------|----------------------------------------------------------|
| 400    | Validation error                                         |
| 401    | Unauthorized                                             |
| 403    | Invitation not accepted                                  |
| 404    | Gift not found                                           |

**Example**

```bash
curl -X POST https://www.lumigift.com/api/v1/gifts/550e8400-e29b-41d4-a716-446655440000/claim \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: <csrf>" \
  -H "Cookie: next-auth.session-token=<token>" \
  -d '{"giftId": "550e8400-e29b-41d4-a716-446655440000", "recipientStellarKey": "GABC...XYZ"}'
```

---

## Profile

### `GET /api/v1/profile`

Retrieve the authenticated user's profile stats and full gift history.

**Auth:** Session required.

**Response (200)**

```json
{
  "success": true,
  "data": {
    "stats": {
      "totalGiftsSent": 12,
      "totalValueNgn": 60000,
      "claimRate": 83,
      "memberSince": "2025-01-15T00:00:00.000Z",
      "displayName": "Amara",
      "phone": "+2348012345678"
    },
    "gifts": [ { ...Gift } ]
  }
}
```

**Example**

```bash
curl https://www.lumigift.com/api/v1/profile \
  -H "Cookie: next-auth.session-token=<token>"
```

---

### `PATCH /api/v1/profile`

Update the authenticated user's display name and/or notification preferences.

**Auth:** Session + CSRF token required.

**Request body** (all fields optional)

| Field                          | Type    | Description                          |
|--------------------------------|---------|--------------------------------------|
| displayName                    | string  | New display name (2–60 chars)        |
| notificationPreferences.sms    | boolean | Enable/disable SMS notifications     |
| notificationPreferences.email  | boolean | Enable/disable email notifications   |

**Response (200)**

```json
{ "success": true, "data": { "updated": true } }
```

**Example**

```bash
curl -X PATCH https://www.lumigift.com/api/v1/profile \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: <csrf>" \
  -H "Cookie: next-auth.session-token=<token>" \
  -d '{"displayName": "Amara O.", "notificationPreferences": {"sms": true, "email": false}}'
```

---

### `DELETE /api/v1/profile`

Schedule the authenticated user's account for deletion. Pending gifts are cancelled, escrowed USDC is refunded, and PII is anonymised.

**Auth:** Session + CSRF token required.

**Response (200)**

```json
{ "success": true, "data": { "scheduled": true } }
```

**Example**

```bash
curl -X DELETE https://www.lumigift.com/api/v1/profile \
  -H "x-csrf-token: <csrf>" \
  -H "Cookie: next-auth.session-token=<token>"
```

---

## Payments

### `POST /api/v1/payments`

Paystack webhook receiver. Verifies the HMAC-SHA512 signature and processes `charge.success` events to transition gifts from `pending_payment` → `locked`.

**Auth:** Paystack HMAC signature in `x-paystack-signature` header (no session required).

**Request body:** Raw Paystack webhook event JSON.

**Response (200)**

```json
{ "received": true }
```

**Errors**

| Status | Description                    |
|--------|--------------------------------|
| 400    | Invalid JSON or schema mismatch|
| 401    | Missing or invalid signature   |

---

### `GET /api/v1/payments/callback`

Paystack redirect callback after the user completes payment in the Paystack checkout. Verifies the payment, validates exchange-rate slippage, and redirects to a success or failure page.

**Auth:** None (Paystack redirect).

**Query parameters**

| Param     | Type   | Required | Description                    |
|-----------|--------|----------|--------------------------------|
| reference | string | ✓        | Paystack payment reference     |
| giftId    | string | ✓        | Gift UUID                      |

**Responses:** HTTP 302 redirect to `/gift/:id/success` or `/gift/:id/payment-failed`.

---

### `POST /api/v1/payments/stripe/webhook`

Stripe webhook receiver for international payments.

**Auth:** Stripe webhook signature in `stripe-signature` header.

**Request body:** Raw Stripe event JSON.

**Response (200)**

```json
{ "received": true }
```

---

## Uploads

### `POST /api/v1/uploads`

Upload a media file (voice note, image) to Cloudinary. Returns the CDN URL.

**Auth:** Session + CSRF token required.

**Request body:** `multipart/form-data` with a `file` field.

**Constraints:** Max 10 MB; accepted types: `audio/*`, `image/*`.

**Response (201)**

```json
{ "success": true, "data": { "url": "https://res.cloudinary.com/..." } }
```

**Errors**

| Status | Description                    |
|--------|--------------------------------|
| 400    | Missing file or invalid type   |
| 413    | File too large                 |

**Example**

```bash
curl -X POST https://www.lumigift.com/api/v1/uploads \
  -H "x-csrf-token: <csrf>" \
  -H "Cookie: next-auth.session-token=<token>" \
  -F "file=@voice-note.webm"
```

---

### `GET /api/v1/uploads/sign`

Get a signed Cloudinary upload URL for direct browser-to-CDN uploads.

**Auth:** Session required.

**Response (200)**

```json
{
  "success": true,
  "data": {
    "signature": "...",
    "timestamp": 1716000000,
    "cloudName": "lumigift",
    "apiKey": "..."
  }
}
```

---

## Users

### `GET /api/v1/users`

Check whether a phone number is registered on Lumigift. Used by the gift creation form to decide whether to send an invitation SMS.

**Auth:** None required.

**Query parameters**

| Param | Type   | Required | Description        |
|-------|--------|----------|--------------------|
| phone | string | ✓        | E.164 phone number |

**Response (200)**

```json
{ "success": true, "data": { "exists": true } }
```

**Example**

```bash
curl "https://www.lumigift.com/api/v1/users?phone=%2B2348012345678"
```

---

## CSRF

### `GET /api/v1/csrf`

Retrieve a CSRF token. Include the returned token in the `x-csrf-token` header for all mutating requests.

**Auth:** None required.

**Response (200)**

```json
{ "success": true, "data": { "csrfToken": "..." } }
```

**Example**

```bash
curl https://www.lumigift.com/api/v1/csrf
```

---

## Cron (Internal)

All cron endpoints require `Authorization: Bearer <CRON_SECRET>`.

### `GET /api/v1/cron/unlock`

Process gifts whose `unlockAt` has passed, transitioning them from `locked` → `unlocked` and notifying recipients.

**Response (200)**

```json
{ "success": true, "data": { "processed": 3, "durationMs": 142 } }
```

---

### `GET /api/v1/cron/expire`

Mark gifts that have been `unlocked` but unclaimed for more than 365 days as `expired` and refund escrowed USDC to the sender.

**Response (200)**

```json
{ "success": true, "data": { "processed": 1, "durationMs": 88 } }
```

---

### `GET /api/v1/cron/notify`

Dispatch scheduled gift notification SMSes for gifts whose `notifyAt` has passed.

**Response (200)**

```json
{ "success": true, "data": { "dispatched": 2, "durationMs": 65 } }
```

---

### `GET /api/v1/cron/index-events`

Index Soroban escrow contract events from Stellar Horizon into the local database.

**Response (200)**

```json
{ "success": true, "data": { "indexed": 5, "durationMs": 310 } }
```

---

## Health

### `GET /api/v1/health/db`

Database connectivity check. Returns `200` when the PostgreSQL connection is healthy.

**Auth:** None required.

**Response (200)**

```json
{ "success": true, "data": { "db": "ok" } }
```

---

## Admin

All admin endpoints require an authenticated session with `role = "admin"`.

### `GET /api/v1/admin/gifts`

List all gifts across all users (paginated).

### `GET /api/v1/admin/gifts/:id`

Retrieve a single gift with full details including sender PII.

### `GET /api/v1/admin/fraud-flags`

List unreviewed fraud flags.

### `PATCH /api/v1/admin/fraud-flags/:id`

Review a fraud flag — approve or reject the flagged gift.

**Request body**

| Field         | Type   | Required | Description                    |
|---------------|--------|----------|--------------------------------|
| action        | string | ✓        | `"approved"` or `"rejected"`   |
| reviewNotes   | string |          | Optional reviewer notes        |

### `GET /api/v1/admin/audit-logs`

Retrieve the audit log for compliance and debugging.

---

## Gift Object

```typescript
{
  id: string;                  // UUID
  senderId: string;            // Sender's user ID
  recipientPhoneHash: string;  // SHA-256 of recipient's E.164 phone (never plaintext)
  recipientName: string;
  recipientEmail?: string;
  amountNgn: number;           // Amount in Nigerian Naira
  amountUsdc: string;          // USDC equivalent (7 decimal places)
  message?: string;
  voiceNoteUrl?: string;
  mediaUrl?: string;
  unlockAt: string;            // ISO 8601
  status: GiftStatus;
  occasion: OccasionCategory;  // "general" | "birthday" | "valentine" | "anniversary" | "graduation" | "christmas"
  notifyAt?: string;           // ISO 8601 — scheduled notification time
  contractId?: string;         // Soroban escrow contract address
  stellarTxHash?: string;      // Funding transaction hash
  claimTxHash?: string;        // Claim transaction hash
  createdAt: string;
  updatedAt: string;
}
```

**GiftStatus values:** `draft` · `pending_payment` · `funded` · `locked` · `unlocked` · `claimed` · `expired` · `cancelled`

---

## Error Codes

| HTTP Status | Meaning                                                  |
|-------------|----------------------------------------------------------|
| 400         | Validation error — check `errors` array for field details|
| 401         | Missing or invalid session / HMAC signature              |
| 403         | Forbidden — authenticated but not authorised             |
| 404         | Resource not found                                       |
| 409         | State conflict (e.g. gift already cancelled)             |
| 413         | Payload too large                                        |
| 422         | Business rule violation (e.g. daily limit exceeded)      |
| 429         | Rate limit exceeded                                      |
| 500         | Internal server error                                    |
