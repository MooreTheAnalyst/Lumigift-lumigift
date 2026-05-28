# Database Backup & Restore Runbook

PostgreSQL is hosted on AWS RDS (`lumigift-prod`). This document covers the backup strategy, retention policy, restore procedure, and alerting setup.

---

## Backup strategy

### Production — RDS automated backups (primary)

RDS automated backups are enabled on the `aws_db_instance.postgres` resource. They capture a daily snapshot plus continuous transaction logs, enabling point-in-time recovery (PITR) to any second within the retention window.

Add the following arguments to `infra/terraform/main.tf` under `aws_db_instance.postgres`:

```hcl
backup_retention_period   = 30          # days
backup_window             = "02:00-03:00"  # UTC, low-traffic window
maintenance_window        = "sun:03:00-sun:04:00"
copy_tags_to_snapshot     = true
```

Apply the change:

```bash
terraform apply -target=aws_db_instance.postgres
```

RDS will automatically:
- Take a full snapshot once per day during `backup_window`
- Stream WAL logs continuously for PITR
- Retain all backups for **30 days**, then delete them automatically

### Staging / local — pg_dump to S3 (secondary)

For staging or as an additional off-site copy, run `pg_dump` via a scheduled job (cron or GitHub Actions).

**Manual one-off backup:**

```bash
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-acl \
  --no-owner \
  --file="lumigift_$(date +%Y%m%d_%H%M%S).dump"
```

**Upload to S3:**

```bash
aws s3 cp lumigift_*.dump s3://lumigift-backups/postgres/ \
  --sse aws:kms
```

**Automated daily backup via cron (example `/etc/cron.d/lumigift-backup`):**

```cron
0 2 * * * root /usr/local/bin/lumigift-backup.sh >> /var/log/lumigift-backup.log 2>&1
```

`/usr/local/bin/lumigift-backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILE="lumigift_${TIMESTAMP}.dump"
BUCKET="lumigift-backups"

pg_dump "$DATABASE_URL" --format=custom --no-acl --no-owner --file="/tmp/${FILE}"
aws s3 cp "/tmp/${FILE}" "s3://${BUCKET}/postgres/${FILE}" --sse aws:kms
rm -f "/tmp/${FILE}"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Backup uploaded: ${FILE}"
```

---

## Retention policy

| Backup type | Retention | Storage |
|---|---|---|
| RDS automated snapshots | 30 days | Managed by AWS |
| RDS manual snapshots | Until deleted manually | Managed by AWS |
| pg_dump files (S3) | 30 days | S3 lifecycle rule (see below) |

**S3 lifecycle rule** — apply to the `lumigift-backups` bucket to auto-expire old dumps:

```json
{
  "Rules": [
    {
      "ID": "expire-postgres-backups",
      "Filter": { "Prefix": "postgres/" },
      "Status": "Enabled",
      "Expiration": { "Days": 30 }
    }
  ]
}
```

Apply via CLI:

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket lumigift-backups \
  --lifecycle-configuration file://s3-lifecycle.json
```

---

## Restore procedure

### Option A — RDS point-in-time restore (recommended for production)

Use this when you need to recover to a specific moment (e.g. just before accidental data deletion).

1. **Identify the target time** — check application logs or Sentry for the last known-good timestamp.

2. **Restore to a new RDS instance** via the AWS console or CLI:

   ```bash
   aws rds restore-db-instance-to-point-in-time \
     --source-db-instance-identifier lumigift-prod \
     --target-db-instance-identifier lumigift-prod-restored \
     --restore-time 2026-04-25T14:30:00Z \
     --db-instance-class db.t4g.micro \
     --no-publicly-accessible
   ```

3. **Verify the restored instance** — connect and spot-check critical tables:

   ```sql
   SELECT COUNT(*) FROM gifts;
   SELECT COUNT(*) FROM gifts WHERE status = 'claimed';
   SELECT MAX(created_at) FROM gifts;
   ```

4. **Update the `DATABASE_URL` secret** in AWS Secrets Manager to point to the restored instance endpoint.

5. **Restart the App Runner service** to pick up the new connection string:

   ```bash
   aws apprunner start-deployment \
     --service-arn <APP_RUNNER_SERVICE_ARN>
   ```

6. **Rename instances** once satisfied — promote the restored instance to `lumigift-prod` and decommission the old one.

### Option B — Restore from pg_dump (staging or manual backup)

Use this to restore a `pg_dump` file to any PostgreSQL instance.

1. **Download the backup from S3:**

   ```bash
   aws s3 cp s3://lumigift-backups/postgres/lumigift_20260425_020000.dump ./restore.dump
   ```

2. **Create a clean target database** (skip if restoring in-place):

   ```bash
   createdb lumigift_restore
   ```

3. **Restore:**

   ```bash
   pg_restore \
     --dbname="$DATABASE_URL" \
     --no-acl \
     --no-owner \
     --verbose \
     restore.dump
   ```

4. **Verify row counts and spot-check data** (same queries as Option A step 3).

5. **Run pending migrations** to ensure schema is current:

   ```bash
   # example using your migration tool
   npx db-migrate up
   ```

### Testing restores

Restore procedures must be tested **quarterly** against a staging environment:

1. Trigger a PITR restore to `lumigift-staging-restored` using a timestamp from the previous day.
2. Run the verification queries above.
3. Confirm the application starts and can read/write data against the restored instance.
4. Document the test date and outcome in the table below.

| Date | Tester | Method | Outcome |
|---|---|---|---|
| — | — | — | — |

---

## Alerts

### RDS backup failure (CloudWatch)

Create a CloudWatch alarm on the `FreeStorageSpace` metric and subscribe to RDS event notifications for backup failures.

**SNS topic for backup alerts:**

```bash
aws sns create-topic --name lumigift-db-backup-alerts

aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:ACCOUNT_ID:lumigift-db-backup-alerts \
  --protocol email \
  --notification-endpoint ops@lumigift.app
```

**RDS event subscription** (covers backup start/finish/failure):

```bash
aws rds create-event-subscription \
  --subscription-name lumigift-backup-events \
  --sns-topic-arn arn:aws:sns:us-east-1:ACCOUNT_ID:lumigift-db-backup-alerts \
  --source-type db-instance \
  --source-ids lumigift-prod \
  --event-categories backup notification
```

### pg_dump script alerts

The backup script (`lumigift-backup.sh`) uses `set -euo pipefail` — any failure exits non-zero. Wire it to an alerting channel by wrapping the cron call:

```bash
/usr/local/bin/lumigift-backup.sh || \
  aws sns publish \
    --topic-arn arn:aws:sns:us-east-1:ACCOUNT_ID:lumigift-db-backup-alerts \
    --message "Lumigift pg_dump backup FAILED on $(hostname) at $(date -u)"
```

---

## Quick reference

| Task | Command / location |
|---|---|
| List RDS snapshots | `aws rds describe-db-snapshots --db-instance-identifier lumigift-prod` |
| Create manual snapshot | `aws rds create-db-snapshot --db-instance-identifier lumigift-prod --db-snapshot-identifier lumigift-manual-YYYYMMDD` |
| List S3 backups | `aws s3 ls s3://lumigift-backups/postgres/` |
| Check backup retention setting | AWS Console → RDS → lumigift-prod → Maintenance & backups |
| Terraform resource | `infra/terraform/main.tf` → `aws_db_instance.postgres` |
