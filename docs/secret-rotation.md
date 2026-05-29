# Secret Rotation Policy

## Overview

All API keys and secrets must be rotated on a quarterly schedule (every 90 days) or immediately if a potential compromise is detected.

## Secrets Inventory

| Secret | Location | Rotation Frequency | Owner |
|--------|----------|--------------------|-------|
| `NEXTAUTH_SECRET` | Secrets Manager | Quarterly | Backend team |
| `CSRF_SECRET` | Secrets Manager | Quarterly | Backend team |
| `STELLAR_SERVER_SECRET_KEY` | Secrets Manager | Quarterly | Blockchain team |
| `PAYSTACK_SECRET_KEY` | Secrets Manager | Quarterly | Payments team |
| `STRIPE_SECRET_KEY` | Secrets Manager | Quarterly | Payments team |
| `STRIPE_WEBHOOK_SECRET` | Secrets Manager | On webhook update | Payments team |
| `TERMII_API_KEY` | Secrets Manager | Quarterly | Backend team |
| `CRON_SECRET` | Secrets Manager | Quarterly | DevOps team |
| `CLOUDINARY_API_SECRET` | Secrets Manager | Quarterly | Backend team |
| `DATABASE_URL` (password) | Secrets Manager | Quarterly | DevOps team |
| `REDIS_PASSWORD` | Secrets Manager | Quarterly | DevOps team |
| `SENTRY_AUTH_TOKEN` | Secrets Manager | Quarterly | DevOps team |

## Rotation Procedures

### NEXTAUTH_SECRET Rotation (Zero-Downtime)

The app supports zero-downtime rotation via `NEXTAUTH_SECRET_PREVIOUS`:

1. Generate a new secret: `openssl rand -base64 32`
2. Set `NEXTAUTH_SECRET_PREVIOUS` = current `NEXTAUTH_SECRET`
3. Set `NEXTAUTH_SECRET` = new secret
4. Deploy — existing sessions remain valid for `NEXTAUTH_ROTATION_GRACE_HOURS` (default 24h)
5. After grace period, clear `NEXTAUTH_SECRET_PREVIOUS`

### STELLAR_SERVER_SECRET_KEY Rotation

1. Generate a new Stellar keypair on the appropriate network
2. Fund the new account with minimum XLM balance
3. Establish USDC trustline on the new account
4. Update `STELLAR_SERVER_SECRET_KEY` and `STELLAR_SERVER_PUBLIC_KEY` in Secrets Manager
5. Deploy the new configuration
6. Call `auditLogKeyRotation(oldPublicKey, newPublicKey, rotatedBy)` to record the rotation
7. Transfer any remaining USDC balance from old account to new account
8. Deactivate the old keypair

### Paystack / Stripe Key Rotation

1. Log into the payment provider dashboard
2. Generate new API keys
3. Update secrets in Secrets Manager
4. Deploy — test with a small transaction
5. Revoke old keys after confirming new keys work

### Database Password Rotation

1. Generate a new strong password: `openssl rand -base64 32`
2. Update the password in PostgreSQL: `ALTER USER lumigift PASSWORD 'new_password';`
3. Update `DATABASE_URL` in Secrets Manager
4. Deploy — connection pool will reconnect with new credentials
5. Verify application health after deployment

## Secret Scanning

### Pre-commit Hook

Gitleaks runs automatically on every commit via the pre-commit hook in `.husky/pre-commit`.

### Manual Scan

To scan the full git history for accidentally committed secrets:

```bash
# Install gitleaks
brew install gitleaks  # macOS
# or: https://github.com/gitleaks/gitleaks/releases

# Scan entire git history
gitleaks detect --source . --log-opts="--all" --report-format json --report-path gitleaks-report.json

# Scan only staged changes
gitleaks protect --staged

# View results
cat gitleaks-report.json | jq .
```

### CI/CD Scanning

Gitleaks runs in CI on every pull request. See `.github/workflows/ci.yml` for configuration.

## If Secrets Are Found in Git History

If gitleaks finds real secrets committed to git history:

1. **Immediately rotate all exposed secrets** — treat them as compromised
2. Notify the security team
3. Use `git filter-repo` to remove the secrets from history:
   ```bash
   pip install git-filter-repo
   git filter-repo --path-glob '*.env' --invert-paths
   # or for specific strings:
   git filter-repo --replace-text <(echo 'EXPOSED_SECRET==>REDACTED')
   ```
4. Force-push the cleaned history (coordinate with team)
5. All team members must re-clone the repository
6. Document the incident in the security log

## Storage Requirements

- **Never** store secrets in `.env` files in production
- **Never** commit secrets to git (even in private repos)
- All production secrets must be stored in AWS Secrets Manager (or equivalent)
- Local development uses `.env.local` (gitignored) with non-production values
- CI/CD uses GitHub Actions secrets (encrypted at rest)

## Audit Trail

All secret rotations must be logged:
- Date of rotation
- Who performed the rotation
- Reason (scheduled / incident response)
- Which secrets were rotated

For Stellar key rotations, use `auditLogKeyRotation()` from `src/lib/stellar.ts`.

## Next Rotation Schedule

| Secret Group | Next Rotation Due |
|-------------|-------------------|
| Auth secrets (NEXTAUTH, CSRF) | 90 days from last rotation |
| Payment keys (Paystack, Stripe) | 90 days from last rotation |
| Stellar keys | 90 days from last rotation |
| Infrastructure (DB, Redis) | 90 days from last rotation |
| Monitoring (Sentry) | 90 days from last rotation |
