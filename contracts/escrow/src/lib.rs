//! Zendvo Escrow Contract
//!
//! Locks USDC for a recipient until a predetermined timestamp.
//! Only the designated recipient can claim after the unlock time.
//!
//! # Storage strategy
//! | Key         | Storage type | Rationale |
//! |-------------|--------------|-----------|
//! | Recipient   | Persistent   | Needed for auth on every claim attempt |
//! | UnlockTime  | Persistent   | Needed for every claim attempt |
//! | Claimed     | Persistent   | Critical guard — must survive ledger expiry |
//! | Sender      | Temporary    | Only used once during initialize for auth |
//! | Token       | Temporary    | Only needed during claim; expires after use |
//! | Amount      | Temporary    | Only needed during claim; expires after use |

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, Symbol,
};

// ─── Storage keys ─────────────────────────────────────────────────────────────

/// Keys stored in **persistent** instance storage (critical state).
#[contracttype]
pub enum PersistentKey {
    Recipient,
    UnlockTime,
    Claimed,
}

/// Keys stored in **temporary** storage (short-lived, lower ledger cost).
#[contracttype]
pub enum TempKey {
    Sender,
    Token,
    Amount,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Initialize the escrow. Called once by the platform after deploying.
    ///
    /// * `sender`      – address that funded the escrow
    /// * `recipient`   – address that may claim after `unlock_time`
    /// * `token`       – USDC token contract address
    /// * `amount`      – amount in stroops (7 decimal places)
    /// * `unlock_time` – Unix timestamp (seconds) after which claim is allowed
    pub fn initialize(
        env: Env,
        sender: Address,
        recipient: Address,
        token: Address,
        amount: i128,
        unlock_time: u64,
    ) {
        // Prevent re-initialization
        if env.storage().persistent().has(&PersistentKey::Recipient) {
            panic!("already initialized");
        }

        sender.require_auth();

        // Persistent: critical state needed for every claim attempt
        env.storage().persistent().set(&PersistentKey::Recipient, &recipient);
        env.storage().persistent().set(&PersistentKey::UnlockTime, &unlock_time);
        env.storage().persistent().set(&PersistentKey::Claimed, &false);

        // Temporary: only needed during the single claim interaction
        env.storage().temporary().set(&TempKey::Sender, &sender);
        env.storage().temporary().set(&TempKey::Token, &token);
        env.storage().temporary().set(&TempKey::Amount, &amount);

        // Transfer USDC from sender into this contract
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&sender, &env.current_contract_address(), &amount);

        env.events().publish(
            (Symbol::new(&env, "initialized"),),
            (sender, recipient, amount, unlock_time),
        );
    }

    /// Claim the escrowed funds. Only callable by the recipient after unlock_time.
    pub fn claim(env: Env) {
        let recipient: Address = env
            .storage()
            .persistent()
            .get(&PersistentKey::Recipient)
            .expect("not initialized");

        recipient.require_auth();

        let claimed: bool = env
            .storage()
            .persistent()
            .get(&PersistentKey::Claimed)
            .unwrap_or(false);

        if claimed {
            panic!("already claimed");
        }

        let unlock_time: u64 = env
            .storage()
            .persistent()
            .get(&PersistentKey::UnlockTime)
            .expect("not initialized");

        let now = env.ledger().timestamp();
        if now < unlock_time {
            panic!("gift is still locked");
        }

        let token: Address = env
            .storage()
            .temporary()
            .get(&TempKey::Token)
            .expect("not initialized");

        let amount: i128 = env
            .storage()
            .temporary()
            .get(&TempKey::Amount)
            .expect("not initialized");

        // Effects before interactions (reentrancy guard)
        env.storage().persistent().set(&PersistentKey::Claimed, &true);

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &recipient, &amount);

        env.events().publish(
            (Symbol::new(&env, "claimed"),),
            (recipient, amount),
        );
    }

    /// Read-only: returns (recipient, amount, unlock_time, claimed).
    pub fn get_state(env: Env) -> (Address, i128, u64, bool) {
        let recipient: Address = env
            .storage()
            .persistent()
            .get(&PersistentKey::Recipient)
            .expect("not initialized");
        let amount: i128 = env
            .storage()
            .temporary()
            .get(&TempKey::Amount)
            .unwrap_or(0);
        let unlock_time: u64 = env
            .storage()
            .persistent()
            .get(&PersistentKey::UnlockTime)
            .expect("not initialized");
        let claimed: bool = env
            .storage()
            .persistent()
            .get(&PersistentKey::Claimed)
            .unwrap_or(false);

        (recipient, amount, unlock_time, claimed)
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token::{Client as TokenClient, StellarAssetClient},
        Env,
    };

    fn create_token(env: &Env, admin: &Address) -> (Address, TokenClient, StellarAssetClient) {
        let token_id = env.register_stellar_asset_contract(admin.clone());
        let token = TokenClient::new(env, &token_id);
        let token_admin = StellarAssetClient::new(env, &token_id);
        (token_id, token, token_admin)
    }

    #[test]
    fn test_initialize_and_claim() {
        let env = Env::default();
        env.mock_all_auths();

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let (token_id, token, token_admin) = create_token(&env, &sender);

        // Mint 100 USDC to sender
        token_admin.mint(&sender, &100_000_000);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        let unlock_time: u64 = 1_000;
        client.initialize(&sender, &recipient, &token_id, &100_000_000, &unlock_time);

        // Advance ledger past unlock time
        env.ledger().with_mut(|l| l.timestamp = 1_001);

        client.claim();

        assert_eq!(token.balance(&recipient), 100_000_000);
    }

    #[test]
    #[should_panic(expected = "gift is still locked")]
    fn test_claim_before_unlock_panics() {
        let env = Env::default();
        env.mock_all_auths();

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let (token_id, _, token_admin) = create_token(&env, &sender);
        token_admin.mint(&sender, &100_000_000);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        client.initialize(&sender, &recipient, &token_id, &100_000_000, &9_999_999);
        client.claim(); // should panic
    }
}
