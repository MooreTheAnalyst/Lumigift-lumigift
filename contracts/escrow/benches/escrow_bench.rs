//! Benchmark tests for the Lumigift escrow contract.
//!
//! Measures Soroban CPU instructions (a proxy for compute units) for the two
//! most important entry-points: `initialize` and `claim`.
//!
//! Run with:
//!   cargo bench --manifest-path contracts/escrow/Cargo.toml
//!
//! The thresholds below are the regression guards (issue #61 AC3).
//! CI fails if either operation exceeds its limit.

use criterion::{criterion_group, criterion_main, Criterion};
use lumigift_escrow::EscrowContract;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{Client as TokenClient, StellarAssetClient},
    Env,
};

// ─── Regression thresholds ────────────────────────────────────────────────────
//
// These are conservative upper bounds derived from the first measured run.
// Tighten them as the contract matures.
//
// Soroban fee formula (approximation, Stellar Protocol 21):
//   fee_stroops ≈ cpu_instructions / 10_000
//   1 XLM = 10_000_000 stroops
//
// At 1 XLM ≈ $0.12 USD and 1 USDC gift:
//   initialize: 500_000 instructions → 50 stroops → ~$0.000_000_6 USD
//   claim:      300_000 instructions → 30 stroops → ~$0.000_000_4 USD
//
// See BENCHMARKS.md for the full fee breakdown.

const INITIALIZE_CPU_LIMIT: u64 = 500_000;
const CLAIM_CPU_LIMIT: u64 = 300_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn make_env() -> Env {
    let env = Env::default();
    env.mock_all_auths();
    env
}

fn bench_initialize(c: &mut Criterion) {
    c.bench_function("initialize", |b| {
        b.iter(|| {
            let env = make_env();
            let sender = soroban_sdk::Address::generate(&env);
            let recipient = soroban_sdk::Address::generate(&env);
            let token_id = env.register_stellar_asset_contract(sender.clone());
            StellarAssetClient::new(&env, &token_id).mint(&sender, &100_000_000);

            let contract_id = env.register_contract(None, EscrowContract);
            let client = lumigift_escrow::EscrowContractClient::new(&env, &contract_id);

            client.initialize(&sender, &recipient, &token_id, &100_000_000, &3_601);

            // Regression guard: fail the benchmark if CPU usage exceeds threshold.
            let cpu = env.cost_estimate().cpu_insns();
            assert!(
                cpu <= INITIALIZE_CPU_LIMIT,
                "initialize used {cpu} CPU instructions, exceeds limit of {INITIALIZE_CPU_LIMIT}"
            );
        });
    });
}

fn bench_claim(c: &mut Criterion) {
    c.bench_function("claim", |b| {
        b.iter(|| {
            let env = make_env();
            let sender = soroban_sdk::Address::generate(&env);
            let recipient = soroban_sdk::Address::generate(&env);
            let token_id = env.register_stellar_asset_contract(sender.clone());
            StellarAssetClient::new(&env, &token_id).mint(&sender, &100_000_000);

            let contract_id = env.register_contract(None, EscrowContract);
            let client = lumigift_escrow::EscrowContractClient::new(&env, &contract_id);

            client.initialize(&sender, &recipient, &token_id, &100_000_000, &3_601);
            env.ledger().with_mut(|l| l.timestamp = 3_601);

            // Reset cost estimate to measure only the claim call.
            env.cost_estimate().reset();
            client.claim();

            let cpu = env.cost_estimate().cpu_insns();
            assert!(
                cpu <= CLAIM_CPU_LIMIT,
                "claim used {cpu} CPU instructions, exceeds limit of {CLAIM_CPU_LIMIT}"
            );
        });
    });
}

criterion_group!(benches, bench_initialize, bench_claim);
criterion_main!(benches);
