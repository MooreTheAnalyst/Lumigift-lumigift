#!/usr/bin/env ts-node
/**
 * Generates the TypeScript client for the Lumigift escrow Soroban contract.
 *
 * Uses `stellar contract bindings typescript` to produce a typed client from
 * the compiled WASM, then writes it to src/lib/contracts/escrow-client.ts.
 *
 * Usage:
 *   npm run contract:bindings
 *
 * Prerequisites:
 *   - stellar-cli installed (cargo install stellar-cli --features opt)
 *   - WASM built: npm run contract:build
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const ROOT = path.resolve(__dirname, "..");
const WASM_PATH = path.join(
  ROOT,
  "contracts/target/wasm32-unknown-unknown/release/lumigift_escrow.wasm"
);
const OUT_DIR = process.env.BINDINGS_OUT_DIR
  ? path.resolve(ROOT, process.env.BINDINGS_OUT_DIR)
  : path.join(ROOT, "src/lib/contracts");
const OUT_FILE = path.join(OUT_DIR, "escrow-client.ts");
const TMP_DIR = path.join(ROOT, ".bindings-tmp");

// ─── Validate prerequisites ───────────────────────────────────────────────────

if (!fs.existsSync(WASM_PATH)) {
  console.error("WASM not found. Run `npm run contract:build` first.");
  process.exit(1);
}

// ─── Run stellar contract bindings typescript ─────────────────────────────────

fs.mkdirSync(TMP_DIR, { recursive: true });

console.log("Generating TypeScript bindings from WASM…");

const result = spawnSync(
  "stellar",
  [
    "contract", "bindings", "typescript",
    "--wasm", WASM_PATH,
    "--contract-id", process.env.STELLAR_ESCROW_CONTRACT_ID ?? "PLACEHOLDER_CONTRACT_ID",
    "--network", process.env.STELLAR_NETWORK ?? "testnet",
    "--output-dir", TMP_DIR,
    "--overwrite",
  ],
  { encoding: "utf-8", shell: false, cwd: ROOT }
);

if (result.error || result.status !== 0) {
  console.error("stellar contract bindings typescript failed:");
  console.error(result.stderr || result.error?.message);
  process.exit(1);
}

// ─── Locate generated file ────────────────────────────────────────────────────

// The CLI writes an index.ts (or src/index.ts) inside the output dir
const candidates = [
  path.join(TMP_DIR, "src", "index.ts"),
  path.join(TMP_DIR, "index.ts"),
];
const generated = candidates.find(fs.existsSync);
if (!generated) {
  console.error("Could not locate generated bindings in", TMP_DIR);
  process.exit(1);
}

// ─── Write to destination ─────────────────────────────────────────────────────

fs.mkdirSync(OUT_DIR, { recursive: true });

const header = `/**
 * Typed TypeScript client for the Lumigift Escrow Soroban contract.
 *
 * AUTO-GENERATED via \`npm run contract:bindings\` — do not edit by hand.
 * Regenerate whenever the contract ABI changes:
 *
 *   npm run contract:build && npm run contract:bindings
 *
 * The CI \`contract-bindings-sync\` job will fail if this file is out of sync
 * with the compiled WASM.
 */

`;

const content = header + fs.readFileSync(generated, "utf-8");
fs.writeFileSync(OUT_FILE, content, "utf-8");

// ─── Cleanup ──────────────────────────────────────────────────────────────────

fs.rmSync(TMP_DIR, { recursive: true, force: true });

// ─── Print checksum for CI sync verification ──────────────────────────────────

const checksum = crypto.createHash("sha256").update(content).digest("hex");
console.log(`✅ Bindings written to ${path.relative(ROOT, OUT_FILE)}`);
console.log(`   SHA-256: ${checksum}`);
