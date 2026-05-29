# Stellar Mainnet Contract Deployment Runbook

This runbook describes the safe deployment path for the Lumigift escrow contract (Ajo contract) to Stellar Mainnet.

## Pre-deployment checklist

- [ ] Contract audit is complete and all critical/high findings are resolved
- [ ] Testnet deployment and end-to-end validation have passed
- [ ] `npm run contract:build` generates the release WASM
- [ ] `contracts/target/wasm32-unknown-unknown/release/lumigift_escrow.wasm` exists
- [ ] `STELLAR_SERVER_SECRET_KEY` is stored securely in production secrets manager
- [ ] `STELLAR_NETWORK=mainnet` and `SECRET_MANAGER_PROVIDER` are configured for production
- [ ] `.contract-ids.json` contains a verified testnet deployment record
- [ ] A signed-off rollback strategy is available

## Deployment steps

### 1. Verify the build and mainnet environment

```bash
npm run contract:build
```

Confirm the new WASM exists:

```bash
ls -l contracts/target/wasm32-unknown-unknown/release/lumigift_escrow.wasm
```

Verify production secrets are available:

```bash
echo "$SECRET_MANAGER_PROVIDER"
echo "$STELLAR_SERVER_SECRET_KEY" | sed -n '1p'
```

### 2. Deploy to mainnet

Use the existing deployment script with explicit confirmation:

```bash
STELLAR_NETWORK=mainnet npm run contract:deploy -- --confirm-mainnet
```

The script will:

- require `--confirm-mainnet`
- enforce a prior testnet deployment record
- prompt for `YES`
- deploy the WASM to Stellar Mainnet
- verify the contract responds to `get_state`
- write the contract ID to `.contract-ids.json`
- append a record to `deployments.log`
- print a Stellar Explorer URL

### 3. Record the deployed contract

After successful deployment, update production configuration:

- `STELLAR_ESCROW_CONTRACT_ID` in the production secrets manager
- `STELLAR_NETWORK=mainnet`
- `STELLAR_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"`

Do not store these values in `.env` files on production.

### 4. Smoke test the deployed contract

Run a minimal post-deploy sanity check:

```bash
stellar contract invoke \
  --network mainnet \
  --source "$STELLAR_SERVER_SECRET_KEY" \
  --id "$STELLAR_ESCROW_CONTRACT_ID" \
  -- get_state
```

Expected result: the contract responds, typically with a `NotInitialized` error if no escrow has been created yet.

### 5. Run `migrate` if needed after upgrade

If the contract code includes a storage layout change, then after the `upgrade` call you must invoke:

```bash
stellar contract invoke \
  --network mainnet \
  --source "$STELLAR_SERVER_SECRET_KEY" \
  --id "$STELLAR_ESCROW_CONTRACT_ID" \
  -- migrate
```

This ensures new storage fields and version markers are written safely.

## Post-deployment validation

- [ ] Verify the contract ID in `.contract-ids.json`
- [ ] Confirm the new WASM hash matches the on-chain contract
- [ ] Confirm `STELLAR_ESCROW_CONTRACT_ID` is present in production secrets manager
- [ ] Run a real payment / gift creation smoke test on mainnet using a small amount
- [ ] Monitor network metrics for the first 60 minutes after deployment
- [ ] Confirm alerting and error reporting are active

## Rollback guidance

If the deployment fails or critical issues are detected:

1. Stop traffic or pause new gift creation in the application
2. If possible, re-deploy the prior WASM hash using the same `upgrade` path
3. If the contract state is incompatible, restore from the prior contract ID and update app config
4. Notify stakeholders immediately and schedule a hotfix window

## Notes

- The mainnet runbook is intentionally separate from the general launch checklist.
- Contract upgrades are not automatically reversible; keep the previous WASM hash and deployment record.
- Use the same secret-management strategy for Starknet production keys, payment provider keys, and Stellar account secrets.
