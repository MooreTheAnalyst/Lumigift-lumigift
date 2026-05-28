# Redis Operations

## Configuration

Redis is configured with **AOF (Append Only File)** persistence to prevent job queue data loss on restart.

| Setting | Value | Reason |
|---------|-------|--------|
| `appendonly` | `yes` | Enables AOF persistence |
| `appendfsync` | `everysec` | Flushes to disk every second — balances durability and performance |
| `appendfilename` | `appendonly.aof` | AOF file name |
| `dir` | `/data` | Persistent volume mount point |

## Running locally

```bash
docker compose up -d redis
```

Redis will be available at `redis://localhost:6379`.

## Recovery procedure

If Redis data is lost or corrupted:

1. **Stop the application** to prevent new jobs from being enqueued.

2. **Check AOF file integrity:**
   ```bash
   docker compose exec redis redis-check-aof /data/appendonly.aof
   ```
   If corrupted, repair it:
   ```bash
   docker compose exec redis redis-check-aof --fix /data/appendonly.aof
   ```

3. **Restart Redis** — it will replay the AOF log automatically:
   ```bash
   docker compose restart redis
   ```

4. **Verify queued jobs** are restored, then restart the application.

5. **For total data loss** (no AOF file): queued unlock jobs must be reconstructed from the PostgreSQL `gifts` table. Query for gifts with `status = 'locked'` and `unlock_at > NOW()` and re-enqueue them manually.
