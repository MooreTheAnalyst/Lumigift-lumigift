# Redis Operations

## Configuration

Redis is configured in a **High Availability (HA) Sentinel Cluster** to eliminate single points of failure.

### Persistence

Redis is configured with **AOF (Append Only File)** persistence to prevent job queue data loss on restart.

| Setting | Value | Reason |
|---------|-------|--------|
| `appendonly` | `yes` | Enables AOF persistence |
| `maxmemory` | `256mb` | Prevents Redis from consuming all system memory |
| `maxmemory-policy` | `allkeys-lru` | Automatically evicts least recently used keys when memory limit is reached |
| `dir` | `/data` | Persistent volume mount point |

### HA Setup (Sentinel)

The cluster consists of:
- **1 Master node** (`redis`)
- **1 Replica node** (`redis-replica`)
- **3 Sentinel nodes** (`redis-sentinel-1`, `redis-sentinel-2`, `redis-sentinel-3`)

Sentinels monitor the master and automatically promote the replica if the master fails.

## Running locally

```bash
# Start the HA cluster
docker compose up -d redis redis-replica redis-sentinel-1 redis-sentinel-2 redis-sentinel-3
```

The application connects to the Sentinels to discover the current master.

## Monitoring

Redis metrics are exposed via `redis-exporter` at `http://localhost:9121/metrics`.

## Testing Failover

To verify automatic failover:

1. **Check current master:**
   ```bash
   docker compose exec redis-sentinel-1 redis-cli -p 26379 sentinel get-master-addr-by-name mymaster
   ```

2. **Pause the master node:**
   ```bash
   docker compose pause redis
   ```

3. **Monitor sentinel logs:**
   ```bash
   docker compose logs -f redis-sentinel-1
   ```
   You should see `+sdown`, `+odown`, and eventually `+switch-master`.

4. **Verify new master:**
   ```bash
   docker compose exec redis-sentinel-1 redis-cli -p 26379 sentinel get-master-addr-by-name mymaster
   ```
   It should now point to the IP of the replica.

5. **Unpause the old master:**
   ```bash
   docker compose unpause redis
   ```
   The old master will rejoin the cluster as a replica of the new master.

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
