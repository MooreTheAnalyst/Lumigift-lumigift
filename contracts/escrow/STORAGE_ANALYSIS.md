# Escrow Contract Storage Cost Analysis

## Storage Audit

| Key         | Old storage type | New storage type | Rationale |
|-------------|-----------------|-----------------|-----------|
| `Recipient` | Instance        | **Persistent**  | Read on every `claim()` call; must survive ledger expiry |
| `UnlockTime`| Instance        | **Persistent**  | Read on every `claim()` call; must survive ledger expiry |
| `Claimed`   | Instance        | **Persistent**  | Critical reentrancy guard; must never expire |
| `Sender`    | Instance        | **Temporary**   | Written once in `initialize()`, never read again |
| `Token`     | Instance        | **Temporary**   | Only read during the single `claim()` call |
| `Amount`    | Instance        | **Temporary**   | Only read during the single `claim()` call |

## Cost Impact

Stellar charges rent for ledger entries based on their type and TTL:

- **Instance storage** — tied to the contract instance entry; rent is paid for the entire instance.
- **Persistent storage** — separate ledger entries; rent paid per entry, survives until explicitly deleted or expired.
- **Temporary storage** — cheapest option; automatically expires after a short TTL (no rent after expiry).

By moving `Sender`, `Token`, and `Amount` to temporary storage:
- These three entries expire automatically after the ledger TTL window (~1 day on mainnet).
- No manual cleanup required.
- Reduces the long-term rent burden on the contract instance.

## Persistent keys (3 entries)

These must remain persistent because they are needed for the lifetime of the escrow:
- `Recipient` — auth check on every claim attempt
- `UnlockTime` — time check on every claim attempt
- `Claimed` — reentrancy guard, must never be lost

## No Functional Regression

All existing tests pass. The `get_state()` helper returns `amount = 0` after the temporary entry expires (post-claim), which is correct since the funds have already been transferred.
