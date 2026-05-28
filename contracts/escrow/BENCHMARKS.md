# Escrow Contract Benchmarks

Soroban charges fees based on **CPU instructions** and **storage bytes**.
This document records measured costs and the regression thresholds enforced by CI.

## How to run

```bash
cargo bench --manifest-path contracts/escrow/Cargo.toml
```

---

## Measured costs (Soroban testutils simulation)

| Operation    | CPU instructions | Storage entries | Ledger entries written |
|--------------|-----------------|-----------------|------------------------|
| `initialize` | ~350 000        | 6 (new)         | 6                      |
| `claim`      | ~200 000        | 6 (read) + 1 (write) | 1                 |

> Values are from the Soroban test environment CPU estimator. On-chain costs
> may differ slightly due to host-function overhead.

---

## CI regression thresholds

| Operation    | Threshold (CPU instructions) |
|--------------|------------------------------|
| `initialize` | 500 000                      |
| `claim`      | 300 000                      |

The benchmark binary asserts these limits at runtime. CI fails if either
operation exceeds its threshold.

---

## Estimated XLM fees (typical gift amounts)

Soroban fee approximation (Protocol 21):

```
fee_stroops ≈ cpu_instructions / 10_000
1 XLM = 10_000_000 stroops
```

| Operation    | CPU instructions | Fee (stroops) | Fee (XLM)    | Fee (USD @ $0.12/XLM) |
|--------------|-----------------|---------------|--------------|------------------------|
| `initialize` | 350 000         | 35            | 0.0000035    | ~$0.00000042           |
| `claim`      | 200 000         | 20            | 0.0000020    | ~$0.00000024           |
| **Total**    | 550 000         | 55            | 0.0000055    | ~$0.00000066           |

For a typical gift of **10 USDC** (10 000 000 stroops), the combined on-chain
fee is less than **0.001% of the gift value** — negligible for the end user.

> Note: The fee formula above covers compute only. Storage rent and base
> transaction fees add a small fixed overhead (~100 stroops per transaction).

---

## Boundary: `unlock_time` semantics

The contract uses strict less-than (`now < unlock_time`), so:

- `timestamp == unlock_time` → **claim succeeds** (boundary is inclusive for the recipient)
- `timestamp == unlock_time - 1` → **claim fails** with `StillLocked`

This is verified by the boundary tests in `src/lib.rs` (`boundary_tests` module).
