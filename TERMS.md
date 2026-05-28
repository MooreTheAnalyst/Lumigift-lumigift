# Lumigift — Terms of Service

_Last updated: April 2026_

## 1. Gift Expiry Policy

Gifts that have passed their unlock date but remain **unclaimed for more than 365 days** are automatically expired.

When a gift expires:

1. Its status is updated to **`expired`** in the Lumigift database.
2. The locked USDC is **refunded to the sender's Stellar address** via the escrow contract.
3. The sender receives an **SMS notification** informing them of the refund.

The expiry check runs daily. Senders are encouraged to remind recipients to claim their gifts promptly after the unlock date.

## 2. Payments

Lumigift processes payments via Paystack (NGN) and Stripe (international cards). All amounts are converted to USDC on the Stellar network. Exchange rates are indicative and may vary.

### Gift Amount Limits

To comply with Nigerian AML (Anti-Money Laundering) regulations:

| Limit | Amount |
|-------|--------|
| Minimum gift amount | ₦500 per transaction |
| Maximum gift amount | ₦500,000 per transaction |
| Daily sending limit | ₦1,000,000 per user per day |

These limits are enforced at both the frontend and backend. Transactions that exceed these limits will be rejected. Limits are configurable by Lumigift administrators and may change with regulatory requirements.

## 3. Liability

Lumigift is not liable for losses arising from incorrect recipient phone numbers, unclaimed gifts, or network outages on the Stellar blockchain.

## 4. Privacy & Data Handling

### Recipient Phone Numbers

Lumigift does **not** store recipient phone numbers in plaintext. When a gift is created:

1. The recipient's phone number is **hashed with SHA-256** before being written to the database.
2. The plaintext number is used **transiently** — only to send the SMS delivery notification — and is never persisted.
3. Lookups (e.g. "gifts for this recipient") are performed against the stored hash.

This means Lumigift cannot reconstruct a recipient's phone number from its database records. If you need to update a recipient's contact details, a new gift must be created.

## 5. Contact

For support, email **support@lumigift.com**.
