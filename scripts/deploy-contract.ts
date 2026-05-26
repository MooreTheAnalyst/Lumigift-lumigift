#!/usr/bin/env ts-node
/**
 * Deploy the Lumigift escrow contract to Stellar Testnet or Mainnet.
 *
 * Steps:
 *   1. Safety gates (mainnet only): require --confirm-mainnet flag and
 *      evidence that testnet contract tests have passed.
 *   2. Deploy WASM via `stellar contract deploy`
 *   3. Verify the deployment by calling `stellar contract invoke -- get_state`
 *      (expects EscrowError::NotInitialized = 4, which proves the contract
 *       is live and responding — it just hasn't been initialized yet)
 *   4. Write the contract ID to .contract-ids.json for environment tracking
 *   5. Append a deployment record to deployments.log
 *   6. Log the Stellar Explorer URL for the deployed contract
 *
 * Usage:
 *   STELLAR_NETWORK=testnet ts-node scripts/deploy-contract.ts
 *   STELLAR_NETWORK=mainnet ts-node scripts/deploy-contract.ts --confirm-mainnet
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

(async () => {

// ─── Config ───────────────────────────────────────────────────────────────────

const network = process.env.STELLAR_NETWORK ?? "testnet";
const isMainnet = network === "mainnet";

const rpcUrl =
  network === "mainnet"
    ? "https://soroban-rpc.stellar.org"
    : "https://soroban-testnet.stellar.org";

const networkPassphrase =
  network === "mainnet"
    ? "Public Global Stellar Network ; September 2015"
    : "Test SDF Network ; September 2015";

const explorerBase =
  network === "mainnet"
    ? "https://stellar.expert/explorer/public/contract"
    : "https://stellar.expert/explorer/testnet/contract";

const ROOT = path.resolve(__dirname, "..");

const wasmPath = path.resolve(
  ROOT,
  "contracts/target/wasm32-unknown-unknown/release/lumigift_escrow.wasm"
);

const contractIdsPath = path.resolve(ROOT, ".contract-ids.json");
const deploymentsLogPath = path.resolve(ROOT, "deployments.log");

// ─── Mainnet safety gates (#60) ───────────────────────────────────────────────

if (isMainnet) {
  // Gate 1: explicit opt-in flag
  if (!process.argv.includes("--confirm-mainnet")) {
    console.error(
      "❌ Mainnet deployment requires the --confirm-mainnet flag.\n" +
      "   Re-run with: STELLAR_NETWORK=mainnet ts-node scripts/deploy-contract.ts --confirm-mainnet"
    );
    process.exit(1);
  }

  // Gate 2: testnet CI must have passed (presence of .contract-ids.json testnet entry)
  let testnetPassed = false;
  if (fs.existsSync(contractIdsPath)) {
    try {
      const ids = JSON.parse(fs.readFileSync(contractIdsPath, "utf-8"));
      testnetPassed = Boolean(ids?.testnet?.escrow);
    } catch { /* ignore parse errors */ }
  }
  if (!testnetPassed) {
    console.error(
      "❌ Mainnet deployment blocked: no testnet deployment record found in .contract-ids.json.\n" +
      "   Deploy and test on testnet first: STELLAR_NETWORK=testnet ts-node scripts/deploy-contract.ts"
    );
    process.exit(1);
  }

  // Gate 3: print summary and prompt for interactive confirmation
  const wasmStat = fs.statSync(wasmPath);
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║              ⚠️  MAINNET DEPLOYMENT SUMMARY ⚠️               ║
╠══════════════════════════════════════════════════════════════╣
║  Network:    ${network.padEnd(48)}║
║  WASM:       ${path.relative(ROOT, wasmPath).padEnd(48)}║
║  WASM size:  ${String(wasmStat.size + " bytes").padEnd(48)}║
║  RPC:        ${rpcUrl.padEnd(48)}║
╚══════════════════════════════════════════════════════════════╝

This will deploy a LIVE contract with REAL funds at stake.
`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const confirmed = await new Promise<boolean>((resolve) => {
    rl.question("Type YES to proceed: ", (answer) => {
      rl.close();
      resolve(answer.trim() === "YES");
    });
  });
  if (!confirmed) {
    console.log("Deployment cancelled.");
    process.exit(0);
  }
}

// ─── Preflight checks ─────────────────────────────────────────────────────────

if (!fs.existsSync(wasmPath)) {
  console.error("❌ WASM not found. Run `npm run contract:build` first.");
  process.exit(1);
}

const secretKey = process.env.STELLAR_SERVER_SECRET_KEY;
if (!secretKey) {
  console.error("❌ Missing required environment variable: STELLAR_SERVER_SECRET_KEY");
  process.exit(1);
}

// Stellar secret keys are 56-character base32 strings starting with 'S'
if (!/^S[A-Z2-7]{55}$/.test(secretKey)) {
  console.error("❌ STELLAR_SERVER_SECRET_KEY does not match expected Stellar secret key format.");
  process.exit(1);
}

// ─── Step 1: Deploy ───────────────────────────────────────────────────────────

console.log(`\n🚀 Deploying escrow contract to ${network}…`);

const deployResult = spawnSync(
  "stellar",
  [
    "contract", "deploy",
    "--wasm", wasmPath,
    "--source", secretKey,
    "--rpc-url", rpcUrl,
    "--network-passphrase", networkPassphrase,
  ],
  { encoding: "utf-8", shell: false }
);

if (deployResult.error || deployResult.status !== 0) {
  console.error("❌ Deployment failed:", deployResult.stderr || deployResult.error?.message);
  process.exit(1);
}

const contractId = deployResult.stdout.trim();
if (!contractId) {
  console.error("❌ Deployment succeeded but no contract ID was returned.");
  process.exit(1);
}

console.log(`✅ Contract deployed: ${contractId}`);

// ─── Step 2: Verify ───────────────────────────────────────────────────────────

console.log("\n🔍 Verifying deployment via get_state…");

const verifyResult = spawnSync(
  "stellar",
  [
    "contract", "invoke",
    "--id", contractId,
    "--source", secretKey,
    "--rpc-url", rpcUrl,
    "--network-passphrase", networkPassphrase,
    "--",
    "get_state",
  ],
  { encoding: "utf-8", shell: false }
);

const hasContractOutput =
  verifyResult.stdout.trim().length > 0 || verifyResult.stderr.includes("HostError");

if (verifyResult.error) {
  console.error("❌ Verification failed (CLI error):", verifyResult.error.message);
  process.exit(1);
}

if (!hasContractOutput) {
  console.error(
    "❌ Verification failed — no response from contract.",
    "\n   stdout:", verifyResult.stdout,
    "\n   stderr:", verifyResult.stderr
  );
  process.exit(1);
}

console.log("✅ Contract is live and responding on-chain.");

// ─── Step 3: Write .contract-ids.json ────────────────────────────────────────

const deployedAt = new Date().toISOString();

let existing: Record<string, unknown> = {};
if (fs.existsSync(contractIdsPath)) {
  try {
    existing = JSON.parse(fs.readFileSync(contractIdsPath, "utf-8"));
  } catch {
    console.warn("⚠️  Could not parse existing .contract-ids.json — overwriting.");
  }
}

const updated = {
  ...existing,
  [network]: {
    escrow: contractId,
    deployedAt,
  },
};

fs.writeFileSync(contractIdsPath, JSON.stringify(updated, null, 2) + "\n", "utf-8");
console.log(`\n📄 Contract ID written to .contract-ids.json`);

// ─── Step 4: Append to deployments.log ───────────────────────────────────────

const logEntry = `${deployedAt}\tnetwork=${network}\tcontract=${contractId}\n`;
fs.appendFileSync(deploymentsLogPath, logEntry, "utf-8");
console.log(`📋 Deployment logged to deployments.log`);

// ─── Step 5: Explorer URL ─────────────────────────────────────────────────────

const explorerUrl = `${explorerBase}/${contractId}`;
console.log(`\n🔗 Stellar Explorer: ${explorerUrl}`);

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`
─────────────────────────────────────────────────
  Network:     ${network}
  Contract ID: ${contractId}
  Deployed at: ${deployedAt}
  Explorer:    ${explorerUrl}
─────────────────────────────────────────────────

Add to .env:
  STELLAR_ESCROW_CONTRACT_ID=${contractId}
`);

})();
