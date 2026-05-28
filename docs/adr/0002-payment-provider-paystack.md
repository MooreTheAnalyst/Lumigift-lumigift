# ADR-0002: Payment Provider — Paystack (NGN On-Ramp)

**Date:** 2024-01-15  
**Status:** Accepted

## Context

Lumigift's primary market is Nigeria. Senders pay in Nigerian Naira (NGN) via card or bank transfer; the platform converts to USDC on Stellar. We need a payment provider that:
- Accepts NGN card and bank-transfer payments
- Has a reliable webhook system for async payment confirmation
- Provides a simple refund API for cancelled gifts
- Is trusted by Nigerian consumers

## Decision

Use **Paystack** as the primary payment provider for NGN on-ramp. **Stripe** is integrated as a secondary provider for international (non-NGN) payments.

## Consequences

### Positive
- Paystack is the dominant payment gateway in Nigeria with high consumer trust and bank coverage.
- Paystack's webhook (`charge.success`) and HMAC-SHA512 signature verification are straightforward to implement securely.
- Paystack supports instant refunds via API, enabling the gift-cancellation flow.
- Stripe handles international cards without requiring a separate merchant account per country.

### Negative
- Two payment providers increase integration surface and maintenance burden.
- Paystack is Nigeria-centric; expanding to other African markets may require additional providers.
- Exchange-rate risk between NGN and USDC must be managed at gift-creation time.

### Neutral
- Both providers require webhook secret rotation as part of the security runbook.

## Alternatives Considered

| Option | Reason Rejected |
|--------|----------------|
| Flutterwave | Also strong in Nigeria but Paystack has higher developer mindshare and simpler API for our use case |
| Stripe only | Stripe does not support NGN card payments natively; Nigerian cards often decline on Stripe |
| Mono / Stitch | Open-banking focused; no card payment support needed for our flow |
