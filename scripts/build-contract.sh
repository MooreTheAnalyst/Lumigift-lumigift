#!/usr/bin/env bash
# Build the Lumigift escrow contract and apply wasm-opt for binary size reduction.
# Requires: Rust + wasm32-unknown-unknown target, stellar CLI, wasm-opt (binaryen)
#
# Typical output size: < 50 KB
# Typical build time: ~30-60s (first build), ~5-10s (incremental)

set -euo pipefail

WASM_OUT="contracts/escrow/target/wasm32-unknown-unknown/release/lumigift_escrow.wasm"
OPTIMIZED_OUT="contracts/escrow/target/wasm32-unknown-unknown/release/lumigift_escrow.optimized.wasm"

echo "==> Building escrow contract (release)..."
START=$(date +%s)

cd contracts
stellar contract build
cd ..

END=$(date +%s)
BUILD_TIME=$((END - START))
echo "==> Build completed in ${BUILD_TIME}s"

# Apply wasm-opt if available
if command -v wasm-opt &> /dev/null; then
  echo "==> Running wasm-opt -Oz..."
  wasm-opt -Oz --strip-debug --strip-producers \
    "$WASM_OUT" \
    -o "$OPTIMIZED_OUT"

  ORIGINAL_SIZE=$(wc -c < "$WASM_OUT")
  OPTIMIZED_SIZE=$(wc -c < "$OPTIMIZED_OUT")
  echo "==> Original:  ${ORIGINAL_SIZE} bytes"
  echo "==> Optimized: ${OPTIMIZED_SIZE} bytes"

  if [ "$OPTIMIZED_SIZE" -gt 51200 ]; then
    echo "WARNING: Optimized WASM exceeds 50 KB (${OPTIMIZED_SIZE} bytes)"
  else
    echo "==> Size check passed (< 50 KB)"
  fi
else
  echo "WARNING: wasm-opt not found. Install binaryen for further size reduction."
  echo "  Ubuntu/Debian: sudo apt install binaryen"
  echo "  macOS:         brew install binaryen"
fi
