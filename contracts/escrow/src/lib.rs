//! Zendvo Escrow Contract
//!
//! Locks USDC for a recipient until a predetermined timestamp.
//! Only the designated recipient can claim after the unlock time.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, Symbol,
};

// ─── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Sender,
    Recipient,
    Token,
    Amount,
    UnlockTime,
    Claimed,
    Admin,
    Paused,
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
        if env.storage().instance().has(&DataKey::Sender) {
            panic!("already initialized");
        }

        // Block new gift creation when paused
        let paused: bool = env
            .storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false);
        if paused {
            panic!("contract is paused");
        }

        sender.require_auth();

        env.storage().instance().set(&DataKey::Sender, &sender);
        env.storage().instance().set(&DataKey::Recipient, &recipient);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Amount, &amount);
        env.storage().instance().set(&DataKey::UnlockTime, &unlock_time);
        env.storage().instance().set(&DataKey::Claimed, &false);

        // Transfer USDC from sender into this contract
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&sender, &env.current_contract_address(), &amount);

        env.events().publish(
            (Symbol::new(&env, "initialized"),),
            (sender, recipient, amount, unlock_time),
        );
    }

    /// Claim the escrowed funds. Only callable by the recipient after unlock_time.
    /// Existing claims are still processable even when paused.
    pub fn claim(env: Env) {
        let recipient: Address = env
            .storage()
            .instance()
            .get(&DataKey::Recipient)
            .expect("not initialized");

        recipient.require_auth();

        let claimed: bool = env
            .storage()
            .instance()
            .get(&DataKey::Claimed)
            .unwrap_or(false);

        if claimed {
            panic!("already claimed");
        }

        let unlock_time: u64 = env
            .storage()
            .instance()
            .get(&DataKey::UnlockTime)
            .expect("not initialized");

        let now = env.ledger().timestamp();
        if now < unlock_time {
            panic!("gift is still locked");
        }

        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .expect("not initialized");

        let amount: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Amount)
            .expect("not initialized");

        env.storage().instance().set(&DataKey::Claimed, &true);

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
            .instance()
            .get(&DataKey::Recipient)
            .expect("not initialized");
        let amount: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Amount)
            .expect("not initialized");
        let unlock_time: u64 = env
            .storage()
            .instance()
            .get(&DataKey::UnlockTime)
            .expect("not initialized");
        let claimed: bool = env
            .storage()
            .instance()
            .get(&DataKey::Claimed)
            .unwrap_or(false);

        (recipient, amount, unlock_time, claimed)
    }

    /// Set the admin address. Can only be called once (before any admin is set).
    pub fn set_admin(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("admin already set");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Pause new gift creation. Restricted to admin.
    pub fn pause(env: Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("admin not set");
        admin.require_auth();

        env.storage().instance().set(&DataKey::Paused, &true);

        env.events().publish(
            (Symbol::new(&env, "paused"),),
            (admin,),
        );
    }

    /// Unpause new gift creation. Restricted to admin.
    pub fn unpause(env: Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("admin not set");
        admin.require_auth();

        env.storage().instance().set(&DataKey::Paused, &false);

        env.events().publish(
            (Symbol::new(&env, "unpaused"),),
            (admin,),
        );
    }

    /// Read-only: returns whether the contract is paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
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

    #[test]
    fn test_pause_blocks_initialize() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let (token_id, _, token_admin) = create_token(&env, &sender);
        token_admin.mint(&sender, &100_000_000);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        client.set_admin(&admin);
        client.pause();

        assert!(client.is_paused());

        // initialize should panic when paused
        let result = std::panic::catch_unwind(|| {
            client.initialize(&sender, &recipient, &token_id, &100_000_000, &9_999_999);
        });
        assert!(result.is_err());
    }

    #[test]
    fn test_unpause_allows_initialize() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let (token_id, _, token_admin) = create_token(&env, &sender);
        token_admin.mint(&sender, &100_000_000);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        client.set_admin(&admin);
        client.pause();
        client.unpause();

        assert!(!client.is_paused());
        // initialize should succeed after unpause
        client.initialize(&sender, &recipient, &token_id, &100_000_000, &9_999_999);
    }

    #[test]
    fn test_claim_still_works_when_paused() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let (token_id, token, token_admin) = create_token(&env, &sender);
        token_admin.mint(&sender, &100_000_000);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        // Initialize before pausing
        client.initialize(&sender, &recipient, &token_id, &100_000_000, &1_000);

        client.set_admin(&admin);
        client.pause();

        // Advance past unlock time and claim — should still work
        env.ledger().with_mut(|l| l.timestamp = 1_001);
        client.claim();

        assert_eq!(token.balance(&recipient), 100_000_000);
    }

    #[test]
    #[should_panic(expected = "admin not set")]
    fn test_pause_requires_admin() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        client.pause(); // should panic — no admin set
    }
}
