/**
 * Escrow event indexer.
 *
 * Fetches Soroban contract events from the RPC node and applies them to the
 * gift database. Processing is idempotent — replaying the same event twice
 * produces the same result.
 *
 * Event → status mapping:
 *   initialized  → locked
 *   claimed      → claimed
 *   cancelled    → cancelled
 *
 * Cursor persistence:
 *   The last-processed cursor is stored in Redis under the key
 *   `escrow:event:cursor`. On each run the indexer reads the cursor,
 *   fetches events after it, applies them, then writes the new cursor back.
 *   If no cursor exists the indexer starts from ledger 0.
 */

import { redis } from "@/lib/redis";
import { serverConfig } from "@/server/config";
import {
  fetchEscrowEvents,
  CURSOR_GENESIS,
  type EscrowEvent,
} from "@/lib/contracts/escrow-events";
import { getGiftByContractId, updateGiftStatusIdempotent } from "./gift.service";

const CURSOR_KEY = "escrow:event:cursor";

// ─── Public API ───────────────────────────────────────────────────────────────

export interface IndexEventsResult {
  processed: number;
  skipped: number;
  latestCursor: string;
}

/**
 * Runs one indexing pass: fetches events since the last cursor, applies them
 * to the DB, and persists the new cursor.
 *
 * Safe to call from a cron job — concurrent calls are serialised by the Redis
 * cursor key (last-writer-wins, which is fine given cron cadence).
 */
export async function indexEscrowEvents(): Promise<IndexEventsResult> {
  const rpcUrl =
    process.env.STELLAR_RPC_URL ??
    (serverConfig.stellar.network === "mainnet"
      ? "https://soroban-rpc.stellar.org"
      : "https://soroban-testnet.stellar.org");

  const contractId = serverConfig.stellar.escrowContractId;
  if (!contractId) {
    console.warn("[event-indexer] STELLAR_ESCROW_CONTRACT_ID not set — skipping");
    return { processed: 0, skipped: 0, latestCursor: CURSOR_GENESIS };
  }

  const startCursor = (await redis.get(CURSOR_KEY)) ?? CURSOR_GENESIS;

  const { events, latestCursor } = await fetchEscrowEvents({
    rpcUrl,
    contractId,
    startCursor,
    limit: 200,
  });

  let processed = 0;
  let skipped = 0;

  for (const event of events) {
    const applied = await applyEvent(event);
    if (applied) processed++;
    else skipped++;
  }

  // Persist cursor even if no events were found, so we advance the ledger window
  if (latestCursor !== startCursor) {
    await redis.set(CURSOR_KEY, latestCursor);
  }

  return { processed, skipped, latestCursor };
}

// ─── Event application ────────────────────────────────────────────────────────

/**
 * Applies a single event to the gift DB.
 * Returns `true` if the gift was updated, `false` if skipped (not found or
 * already in the target status — idempotent).
 */
async function applyEvent(event: EscrowEvent): Promise<boolean> {
  const gift = await getGiftByContractId(event.contractId);

  if (!gift) {
    // Contract ID not tracked in our DB — could be a different deployment
    console.debug(
      `[event-indexer] no gift found for contractId=${event.contractId}, skipping`
    );
    return false;
  }

  switch (event.type) {
    case "initialized": {
      if (gift.status === "locked") return false; // already applied
      await updateGiftStatusIdempotent(gift.id, "locked");
      console.log(
        `[event-indexer] initialized → locked  gift=${gift.id} tx=${event.txHash}`
      );
      return true;
    }

    case "claimed": {
      if (gift.status === "claimed") return false; // already applied
      await updateGiftStatusIdempotent(gift.id, "claimed");
      console.log(
        `[event-indexer] claimed → claimed  gift=${gift.id} tx=${event.txHash}`
      );
      return true;
    }

    case "cancelled": {
      if (gift.status === "cancelled") return false; // already applied
      await updateGiftStatusIdempotent(gift.id, "cancelled");
      console.log(
        `[event-indexer] cancelled → cancelled  gift=${gift.id} tx=${event.txHash}`
      );
      return true;
    }

    default: {
      const _exhaustive: never = event;
      return false;
    }
  }
}
