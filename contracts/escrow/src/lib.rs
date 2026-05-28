//! Zendvo Escrow Contract
//!
//! Locks USDC for a recipient until a predetermined timestamp.
//! Only the designated recipient can claim after the unlock time.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, token, vec, Address, Env, Symbol, Vec,
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
    GiftsBySender(Address),
    GiftCount,
}

// ─── Gift struct ──────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct GiftInfo {
    pub sender: Address,
    pub recipient: Address,
    pub token: Address,
    pub amount: i128,
    pub unlock_time: u64,
    pub claimed: bool,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Initialize the escrow. Called once by the platform after deploying.
    pub fn initialize(
        env: Env,
        sender: Address,
        recipient: Address,
        token: Address,
        amount: i128,
        unlock_time: u64,
    ) {
        if env.storage().instance().has(&DataKey::Sender) {
            panic!("already initialized");
        }

        sender.require_auth();

        env.storage().instance().set(&DataKey::Sender, &sender);
        env.storage().instance().set(&DataKey::Recipient, &recipient);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Amount, &amount);
        env.storage().instance().set(&DataKey::UnlockTime, &unlock_time);
        env.storage().instance().set(&DataKey::Claimed, &false);

        // Track gift ID for this sender
        let gift_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::GiftCount)
            .unwrap_or(0u64);
        env.storage().instance().set(&DataKey::GiftCount, &(gift_id + 1));

        let key = DataKey::GiftsBySender(sender.clone());
        let mut ids: Vec<u64> = env
            .storage()
            .instance()
            .get(&key)
            .unwrap_or_else(|| vec![&env]);
        ids.push_back(gift_id);
        env.storage().instance().set(&key, &ids);

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

        if env.ledger().timestamp() < unlock_time {
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

    // ─── View functions (no state side effects) ───────────────────────────────

    /// Returns the full gift struct for this escrow instance.
    pub fn get_gift(env: Env) -> GiftInfo {
        GiftInfo {
            sender: env.storage().instance().get(&DataKey::Sender).expect("not initialized"),
            recipient: env.storage().instance().get(&DataKey::Recipient).expect("not initialized"),
            token: env.storage().instance().get(&DataKey::Token).expect("not initialized"),
            amount: env.storage().instance().get(&DataKey::Amount).expect("not initialized"),
            unlock_time: env.storage().instance().get(&DataKey::UnlockTime).expect("not initialized"),
            claimed: env.storage().instance().get(&DataKey::Claimed).unwrap_or(false),
        }
    }

    /// Returns true if the gift can be claimed right now.
    pub fn is_claimable(env: Env) -> bool {
        let claimed: bool = env.storage().instance().get(&DataKey::Claimed).unwrap_or(false);
        if claimed {
            return false;
        }
        let unlock_time: u64 = env
            .storage()
            .instance()
            .get(&DataKey::UnlockTime)
            .unwrap_or(u64::MAX);
        env.ledger().timestamp() >= unlock_time
    }

    /// Returns the list of gift IDs created by `sender`.
    pub fn get_gifts_by_sender(env: Env, sender: Address) -> Vec<u64> {
        env.storage()
            .instance()
            .get(&DataKey::GiftsBySender(sender))
            .unwrap_or_else(|| vec![&env])
    }

    /// Read-only: returns (recipient, amount, unlock_time, claimed).
    pub fn get_state(env: Env) -> (Address, i128, u64, bool) {
        let recipient: Address = env.storage().instance().get(&DataKey::Recipient).expect("not initialized");
        let amount: i128 = env.storage().instance().get(&DataKey::Amount).expect("not initialized");
        let unlock_time: u64 = env.storage().instance().get(&DataKey::UnlockTime).expect("not initialized");
        let claimed: bool = env.storage().instance().get(&DataKey::Claimed).unwrap_or(false);
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
        token_admin.mint(&sender, &100_000_000);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        client.initialize(&sender, &recipient, &token_id, &100_000_000, &1_000);
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
        client.claim();
    }

    #[test]
    fn test_get_gift_returns_full_struct() {
        let env = Env::default();
        env.mock_all_auths();

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let (token_id, _, token_admin) = create_token(&env, &sender);
        token_admin.mint(&sender, &100_000_000);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        client.initialize(&sender, &recipient, &token_id, &100_000_000, &5_000);

        let info = client.get_gift();
        assert_eq!(info.sender, sender);
        assert_eq!(info.recipient, recipient);
        assert_eq!(info.amount, 100_000_000);
        assert_eq!(info.unlock_time, 5_000);
        assert!(!info.claimed);
    }

    #[test]
    fn test_is_claimable() {
        let env = Env::default();
        env.mock_all_auths();

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let (token_id, _, token_admin) = create_token(&env, &sender);
        token_admin.mint(&sender, &100_000_000);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        client.initialize(&sender, &recipient, &token_id, &100_000_000, &1_000);

        assert!(!client.is_claimable());
        env.ledger().with_mut(|l| l.timestamp = 1_000);
        assert!(client.is_claimable());

        client.claim();
        assert!(!client.is_claimable());
    }

    #[test]
    fn test_get_gifts_by_sender() {
        let env = Env::default();
        env.mock_all_auths();

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let (token_id, _, token_admin) = create_token(&env, &sender);
        token_admin.mint(&sender, &100_000_000);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        assert_eq!(client.get_gifts_by_sender(&sender).len(), 0);

        client.initialize(&sender, &recipient, &token_id, &100_000_000, &9_999_999);

        assert_eq!(client.get_gifts_by_sender(&sender).len(), 1);
    }
}
