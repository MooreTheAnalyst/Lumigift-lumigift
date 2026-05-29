# Production Secrets Management

This guide explains how the Lumigift production deployment should avoid `.env` files and use a secrets manager instead.

## Why production secrets should not live in `.env`

- `.env` files are easy to leak through backups, logs, or image builds
- They are hard to rotate centrally across environments
- Cloud-secret stores provide audit trails, IAM access controls, and automatic rotation

## Supported providers

The application supports two production secret providers:

- `AWS Secrets Manager`
- `HashiCorp Vault`

The server will only fetch secrets at runtime in production, not during the Next.js production build.

## Configuration variables

### Common variables

- `SECRET_MANAGER_PROVIDER` — required in production
  - `aws`
  - `vault`

### AWS Secrets Manager

Required:

- `AWS_SECRETS_MANAGER_SECRET_ID`
- `AWS_REGION`

Optional:

- standard AWS SDK credentials (IAM role, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`)

### HashiCorp Vault

Required:

- `VAULT_ADDR`
- `VAULT_TOKEN`
- `VAULT_SECRET_PATH`


## Expected secret payload format

The secret payload should be a JSON object where each field is an environment variable name.

Example:

```json
{
  "DATABASE_URL": "postgresql://...",
  "PAYSTACK_SECRET_KEY": "sk_live_...",
  "STRIPE_SECRET_KEY": "sk_live_...",
  "STRIPE_WEBHOOK_SECRET": "whsec_...",
  "CRON_SECRET": "...",
  "NEXTAUTH_SECRET": "..."
}
```

The loader also supports plaintext secrets in `KEY=VALUE` lines.

## How it works in Lumigift

At server startup, the production configuration loader:

1. checks `SECRET_MANAGER_PROVIDER`
2. fetches secrets from AWS Secrets Manager or Vault
3. injects missing values into `process.env`
4. validates all required server environment variables

This means production can be configured with a single `SECRET_MANAGER_PROVIDER` and a secret store entry instead of server-side `.env` files.

## Production deployment checklist

- [ ] No `.env` or `.env.local` files are present on production instances
- [ ] `SECRET_MANAGER_PROVIDER` is set to `aws` or `vault`
- [ ] All required runtime secrets are available in the selected provider
- [ ] `STELLAR_SERVER_SECRET_KEY` is stored in the secrets manager, not in a file
- [ ] `NEXTAUTH_SECRET` and `CRON_SECRET` are rotated regularly
- [ ] Secrets manager audit logs are enabled

## Local development

For local development, continue using `.env.local` and `.env.local.example`.

Do not enable secrets manager integration locally unless you intentionally want to test the production configuration path.
