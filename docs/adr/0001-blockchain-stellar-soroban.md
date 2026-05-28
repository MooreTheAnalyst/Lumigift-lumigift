# ADR-0001: Blockchain Platform — Stellar / Soroban

**Date:** 2024-01-15  
**Status:** Accepted

## Context

Lumigift requires a smart-contract platform to time-lock USDC until a recipient's unlock date. The platform must support:
- Native USDC (Circle-issued) without bridging
- Sub-cent transaction fees (gifts as small as ₦500 must be economically viable)
- Smart contracts with time-based logic
- Testnet tooling suitable for a small team

## Decision

Use **Stellar** as the blockchain layer with **Soroban** smart contracts written in Rust.

## Consequences

### Positive
- Circle issues USDC natively on Stellar — no bridge risk or wrapped-token complexity.
- Stellar transaction fees are ~0.00001 XLM (fractions of a cent), making micro-gifts viable.
- Soroban contracts compile to WASM and run deterministically; Rust's type system prevents many contract bugs at compile time.
- Stellar's Horizon API and Stellar SDK (JS + Rust) are well-documented and actively maintained.
- Testnet is freely available and mirrors mainnet behaviour.

### Negative
- Soroban is newer than EVM; the ecosystem of audited libraries is smaller.
- Team must maintain Rust expertise alongside TypeScript.
- Fewer third-party integrations compared to Ethereum/EVM chains.

### Neutral
- Stellar's account model differs from EVM; contributors familiar with Ethereum need a learning curve.

## Alternatives Considered

| Option | Reason Rejected |
|--------|----------------|
| Ethereum / Solidity | Gas fees make micro-gifts uneconomical; USDC requires bridging or is a separate ERC-20 with no native guarantee |
| Polygon | Lower fees than Ethereum mainnet but still higher than Stellar; USDC still not natively issued |
| Solana | Native USDC available, but Rust/Anchor tooling is less mature for time-lock patterns; ecosystem volatility |
| Algorand | Smaller developer community; fewer SDK resources for the team's stack |
