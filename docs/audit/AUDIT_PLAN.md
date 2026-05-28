# Soroban Smart Contract Audit Plan

## Overview

The Lumigift escrow contract (`contracts/escrow`) locks USDC on behalf of users until a predetermined unlock time. Before mainnet deployment, an independent security audit is required.

---

## Audit Scope

### Contract: `contracts/escrow/src/lib.rs`

| Function | Description |
|---|---|
| `initialize` | Deploys escrow state, transfers USDC from sender into contract |
| `claim` | Releases funds to recipient after unlock time |
| `get_state` | Read-only view of escrow state |

### Areas of Focus

- **Token validation** — ensure only the canonical USDC contract address is accepted
- **Re-initialization guard** — verify the `already initialized` check is sufficient
- **Authorization** — `sender.require_auth()` and `recipient.require_auth()` correctness
- **Time-lock logic** — ledger timestamp comparison for unlock enforcement
- **Integer arithmetic** — amount handling in stroops (no overflow/underflow)
- **Storage hygiene** — correct use of `instance` storage and key namespacing
- **Event emissions** — accuracy of emitted event data

---

## Recommended Audit Firms

| Firm | Specialization | Website |
|---|---|---|
| OtterSec | Soroban / Rust smart contracts | https://osec.io |
| Halborn | Stellar ecosystem, blockchain security | https://halborn.com |
| Trail of Bits | Rust, formal verification | https://trailofbits.com |
| Certora | Formal verification for smart contracts | https://certora.com |
| Kudelski Security | Blockchain audits | https://kudelskisecurity.com |

> Prioritize firms with demonstrated Soroban/Stellar experience. OtterSec and Halborn have prior Stellar ecosystem work.

---

## Known Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Fake token address passed to `initialize` | Critical | Validate `token == USDC_CONTRACT_ADDRESS` in `initialize` (see issue #51) |
| Re-initialization attack | High | `already initialized` panic guard on `DataKey::Sender` presence |
| Premature claim | High | `unlock_time` check against `env.ledger().timestamp()` |
| Unauthorized claim | High | `recipient.require_auth()` enforced by Soroban host |
| Contract upgrade path | Medium | No upgrade mechanism — contract is immutable; document this explicitly |
| Ledger timestamp manipulation | Low | Soroban ledger timestamps are consensus-driven; not manipulable by a single party |
| Integer overflow on amount | Low | Soroban uses `i128`; amounts in stroops are well within range |

---

## Audit Timeline

| Milestone | Target Date |
|---|---|
| Finalize contract code & freeze scope | 2 weeks before audit start |
| Firm selection & NDA signed | 4 weeks before mainnet |
| Audit engagement begins | 6 weeks before mainnet |
| Preliminary findings delivered | 8 weeks before mainnet |
| Fixes implemented & re-review | 10 weeks before mainnet |
| Final audit report published | 2 weeks before mainnet |
| Mainnet deployment | TBD |

---

## Bug Bounty Program

A bug bounty program is recommended to complement the formal audit and provide ongoing security coverage post-launch.

### Proposed Scope

- **In scope:** `contracts/escrow` on testnet and mainnet
- **Out of scope:** Frontend UI, off-chain services, third-party integrations (Paystack, Stripe)

### Severity & Rewards

| Severity | Example | Reward |
|---|---|---|
| Critical | Drain escrow funds, bypass time-lock | $5,000 – $20,000 USDC |
| High | Unauthorized claim, re-initialization | $1,000 – $5,000 USDC |
| Medium | Incorrect event data, DoS | $250 – $1,000 USDC |
| Low | Gas inefficiency, informational | $50 – $250 USDC |

### Recommended Platforms

- [Immunefi](https://immunefi.com) — largest Web3 bug bounty platform
- [HackerOne](https://hackerone.com) — broad security community

> Launch the bug bounty program at the same time as mainnet deployment. Fund the bounty pool before going live.

---

## References

- [Soroban Security Best Practices](https://developers.stellar.org/docs/build/smart-contracts/security)
- [Stellar Ecosystem Audit Reports](https://github.com/stellar/stellar-protocol)
- [OtterSec Soroban Audit Examples](https://osec.io/blog)
