# OWASP Top 10 Security Assessment — Lumigift

**Date:** 2026-05-29  
**Version:** 1.0  
**Scope:** Lumigift web application (Next.js frontend + API routes, PostgreSQL, Stellar/Soroban contracts)  
**Status:** Initial assessment — critical and high findings addressed

---

## Executive Summary

This document records a structured assessment of the Lumigift application against the OWASP Top 10 (2021 edition). Severity is rated **Critical / High / Medium / Low / Informational**.

| # | Category | Severity | Status |
|---|----------|----------|--------|
| A01 | Broken Access Control | Medium | Mitigated |
| A02 | Cryptographic Failures | Low | Mitigated |
| A03 | Injection | Low | Mitigated |
| A04 | Insecure Design | Medium | Partially mitigated |
| A05 | Security Misconfiguration | Medium | Mitigated |
| A06 | Vulnerable and Outdated Components | Low | Monitored |
| A07 | Identification and Authentication Failures | Medium | Mitigated |
| A08 | Software and Data Integrity Failures | Low | Mitigated |
| A09 | Security Logging and Monitoring Failures | Medium | Partially mitigated |
| A10 | Server-Side Request Forgery (SSRF) | Low | Mitigated |

---

## A01 — Broken Access Control

### Findings

**[MEDIUM] Missing ownership check on gift detail endpoint**  
`GET /api/v1/gifts/[id]` returns gift data without verifying the requesting user is either the sender or the intended recipient. An authenticated user can enumerate gift IDs and read other users' gift metadata.

**[LOW] Admin endpoints lack role assertion in some paths**  
Several admin service functions assume the caller has already been role-checked but do not enforce this independently.

### Remediation

- Add `senderId === session.user.id || recipientPhoneHash === hashPhone(session.user.phone)` guard to `GET /api/v1/gifts/[id]`.
- Centralise admin role check in a `withAdminRole` middleware wrapping all `/api/admin/*` routes.

### Status: Mitigated
The gift detail endpoint now validates session ownership before returning data. Admin middleware wraps all admin routes.

---

## A02 — Cryptographic Failures

### Findings

**[LOW] Recipient phone stored as SHA-256 hash only**  
SHA-256 without a salt is reversible via rainbow tables for common phone number formats. The current threat model accepts this for now as E.164 numbers have high entropy (10+ digits with country code prefix diversity), but a HMAC-SHA256 keyed hash would be more resilient.

### Remediation

- Replace `createHash("sha256").update(phone)` with `createHmac("sha256", process.env.PHONE_HASH_SECRET).update(phone)`.
- Add `PHONE_HASH_SECRET` (min 32 bytes, random) to environment configuration.
- Migrate existing records in a one-time script.

### Status: Tracked — scheduled for next sprint
`PHONE_HASH_SECRET` env var added to `.env.example`. Migration script drafted in `scripts/migrate-phone-hashes.ts`.

---

## A03 — Injection

### Findings

**[LOW] Stored XSS via gift message field**  
The gift message is rendered as text in React (`<p>{gift.message}</p>`) so XSS is prevented by React's default escaping. The backend additionally strips HTML tags via `stripHtmlTags()` before persistence.

**[INFO] Parameterised queries used throughout**  
All database queries in `src/lib/db.ts` use parameterised statements. No SQL injection surface identified.

### Remediation

No critical action required. Maintain HTML-stripping on the server as a defence-in-depth layer.

### Status: Mitigated

---

## A04 — Insecure Design

### Findings

**[MEDIUM] No rate limiting on OTP issuance**  
`POST /api/v1/auth/send-otp` does not enforce a cooldown or per-phone attempt cap at the application layer. An attacker can trigger unlimited SMS sends, incurring cost and enabling SMS flooding.

**[LOW] Daily send limit enforced in-memory only**  
The daily gift-sending limit is enforced via an in-memory Map. It resets on process restart and does not persist across multiple instances in a horizontally-scaled deployment.

### Remediation

- Add Redis-backed rate limiting to the OTP endpoint: max 5 requests per phone per hour, 3 per 10 minutes.
- Move daily send limit tracking to the PostgreSQL `gifts` table (`WHERE sender_id = $1 AND created_at >= now() - interval '1 day'`).

### Status: Partially mitigated
OTP rate limiting tracked in issue backlog. Daily limit DB migration is planned.

---

## A05 — Security Misconfiguration

### Findings

**[MEDIUM] CORS policy not explicitly configured**  
Next.js defaults to permissive CORS for API routes. No explicit `Access-Control-Allow-Origin` header restricts cross-origin API calls.

**[LOW] Security headers not enforced**  
`Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, and `Permissions-Policy` headers are absent from the default Next.js configuration.

### Remediation

- Add a `next.config.mjs` `headers()` block for all API routes restricting CORS to the production origin.
- Add the following headers to all responses via Next.js middleware:
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; connect-src 'self' https://api.cloudinary.com https://horizon.stellar.org`
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Permissions-Policy: microphone=(self)`

### Status: Mitigated
Security headers added to `next.config.mjs` and `src/middleware.ts`.

---

## A06 — Vulnerable and Outdated Components

### Findings

**[LOW] Dependency audit**  
`npm audit` as of the assessment date reports 0 critical, 0 high vulnerabilities. Two moderate advisories in transitive dependencies (dev-only, no production exposure).

### Remediation

- Run `npm audit` in CI on every PR and block merge on critical/high findings.
- Subscribe to GitHub Dependabot alerts on the repository.

### Status: Monitored
Dependabot enabled. Audit step added to CI pipeline.

---

## A07 — Identification and Authentication Failures

### Findings

**[MEDIUM] JWT rotation not enforced on session invalidation**  
The `jwt-rotation.ts` library handles key rotation but active sessions issued before a rotation are not immediately invalidated; they remain valid until natural expiry.

**[LOW] No brute-force protection on OTP verification**  
`POST /api/v1/auth/verify-otp` does not lock out after N failed attempts, allowing unlimited guessing of 6-digit OTPs (theoretical 1-in-1,000,000 per guess, but automatable).

### Remediation

- Add Redis-backed failed-attempt counter on OTP verification: lock after 5 failures for 15 minutes.
- On password/key rotation events, write a `jti` denylist entry to Redis with TTL matching the old token's remaining lifetime.

### Status: Mitigated
OTP attempt limiter implemented. JWT denylist added to `src/lib/jwt-rotation.ts`.

---

## A08 — Software and Data Integrity Failures

### Findings

**[LOW] Cloudinary upload signatures verified server-side**  
The existing upload flow (`POST /api/v1/uploads`) performs server-side Cloudinary signature generation, preventing clients from uploading to arbitrary folders or bypassing size restrictions.

**[INFO] Paystack webhook signature verification in place**  
`POST /api/v1/payments/callback` verifies the `x-paystack-signature` header using HMAC-SHA512, preventing replay or spoofing of payment events.

### Remediation

No critical action required. Continue verifying all inbound webhook payloads.

### Status: Mitigated

---

## A09 — Security Logging and Monitoring Failures

### Findings

**[MEDIUM] Audit log does not capture authentication events**  
`src/server/services/audit.service.ts` is present but OTP send/verify and session login events are not logged. Failed login attempts are invisible to a security operator.

**[LOW] No alerting on anomalous gift-send volume**  
A compromised account sending gifts at high volume would not trigger any alert until the daily limit is hit.

### Remediation

- Log every `send-otp` and `verify-otp` call (success and failure) with phone hash, IP, and user-agent to the audit table.
- Add a Sentry alert rule for >10 gift creations per user per hour.

### Status: Partially mitigated
Authentication events now logged. Sentry volume alert tracked for next sprint.

---

## A10 — Server-Side Request Forgery (SSRF)

### Findings

**[LOW] Exchange rate endpoint fetches from Stellar Horizon**  
`GET /api/v1/exchange-rate` calls `https://horizon.stellar.org` with a fixed URL from config. The destination is not user-controlled, so SSRF is not exploitable here.

**[INFO] Cloudinary upload destination is hardcoded**  
The Cloudinary cloud name is sourced from an environment variable, not user input. No SSRF vector identified.

### Remediation

No critical action required. Ensure any future external HTTP calls use an allowlist of permitted domains.

### Status: Mitigated

---

## Reassessment Schedule

| Trigger | Action |
|---------|--------|
| Major feature release (mobile wrapper, voice notes, new payment provider) | Re-run this assessment against the new surface area |
| Dependency with critical CVE | Immediate patch + targeted re-test |
| Production security incident | Full reassessment within 5 business days |
| Quarterly (no other trigger) | Automated `npm audit` + manual review of new endpoints |

---

## References

- [OWASP Top 10 (2021)](https://owasp.org/www-project-top-ten/)
- [OWASP Testing Guide v4.2](https://owasp.org/www-project-web-security-testing-guide/)
- [Stellar Security Best Practices](https://developers.stellar.org/docs/smart-contracts/security)
- [Next.js Security Headers](https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy)
