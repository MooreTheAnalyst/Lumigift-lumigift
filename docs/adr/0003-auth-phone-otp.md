# ADR-0003: Authentication Method — Phone OTP

**Date:** 2024-01-15  
**Status:** Accepted

## Context

Lumigift targets Nigerian users who send gifts to other Nigerians. We need an authentication method that:
- Works for users who may not have or regularly use email
- Provides a familiar, low-friction login experience
- Supports the gift-claim flow where recipients may be first-time users
- Integrates with NextAuth.js (our session management library)

## Decision

Use **phone number + OTP** (one-time password via SMS) as the sole authentication method, delivered through **Termii** (a Nigerian SMS provider). NextAuth.js manages the session after OTP verification.

## Consequences

### Positive
- Phone numbers are universal in Nigeria; virtually all target users have one.
- SMS OTP is a familiar pattern — no password to forget or email to check.
- Termii provides Nigerian DLT-registered sender IDs, improving SMS deliverability.
- Phone-based identity aligns with the gift-claim flow: recipients receive a claim link via SMS.
- Rate limiting (3 OTPs per phone per 10 min, 10 per IP per hour) is straightforward to implement.

### Negative
- SMS delivery is not guaranteed; network issues can delay or drop OTPs.
- SIM-swap attacks are a real threat; we mitigate with device fingerprinting and suspicious-login reporting.
- Termii is a third-party dependency; outages affect login availability.
- International users (non-Nigerian numbers) may experience higher SMS latency or failure rates.

### Neutral
- NextAuth.js Credentials provider is used with a custom OTP verification step rather than a built-in magic-link flow.

## Alternatives Considered

| Option | Reason Rejected |
|--------|----------------|
| Email + password | Many Nigerian users do not actively monitor email; higher friction for the target demographic |
| Email magic link | Same deliverability concerns as email + password |
| WhatsApp OTP | Higher deliverability but requires WhatsApp Business API approval and per-message cost |
| Social OAuth (Google/Facebook) | Not all users have or want to use social accounts; adds OAuth complexity |
