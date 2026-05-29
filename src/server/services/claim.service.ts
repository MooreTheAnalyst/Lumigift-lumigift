import { validateStellarAccount } from "@/lib/stellar";
import { updateGiftStatus, storeClaimTxHash } from "./gift.service";
import {
  createEscrowClient,
  EscrowContractError,
  EscrowError,
} from "@/lib/contracts/escrow-client";
import { enqueueClaim } from "@/lib/queues/stellar-tx.queue";
import { sendClaimConfirmationEmail } from "@/lib/email";
import type { Gift } from "@/types";

/**
 * Claims a gift by enqueuing a background Stellar transaction job.
 *
 * Steps performed:
 * 1. Validates that the gift status is `"unlocked"`.
 * 2. Validates the recipient Stellar account exists and is funded.
 * 3. Verifies on-chain state via the escrow client (`get_state`).
 * 4. Enqueues a BullMQ job to submit the USDC payment asynchronously.
 *
 * The actual Stellar tx submission (and status update to "claimed") happens
 * in the background worker (`stellar-tx.queue.ts`), decoupling the HTTP
 * response from blockchain latency.
 *
 * @param gift - The {@link Gift} to claim. Must have status `"unlocked"`.
 * @param recipientStellarKey - The recipient's Stellar public key (G…).
 * @returns An object containing the BullMQ `jobId` for tracking.
 * @throws `Error("Gift is not yet unlocked.")` if the gift status is not `"unlocked"`.
 * @throws `Error("Invalid recipient Stellar account: …")` if the account is not funded.
 * @throws {@link EscrowContractError} if the on-chain state check fails.
 */
export async function claimGift(
  gift: Gift,
  recipientStellarKey: string
): Promise<{ jobId: string }> {
  if (gift.status !== "unlocked") {
    throw new Error("Gift is not yet unlocked.");
  }

  // Validate recipient Stellar account exists and is funded before enqueuing
  const accountCheck = await validateStellarAccount(recipientStellarKey);
  if (!accountCheck.valid) {
    throw new Error(`Invalid recipient Stellar account: ${accountCheck.reason}`);
  }

  // Verify on-chain state before enqueuing
  if (gift.contractId) {
    const escrow = createEscrowClient();
    try {
      const state = await escrow.getState();
      if (state.claimed) {
        throw new EscrowContractError(EscrowError.AlreadyClaimed);
      }
    } catch (err) {
      if (err instanceof EscrowContractError) throw err;
      // Non-fatal: log and proceed if RPC is unavailable
      console.warn("escrow get_state check skipped:", (err as Error).message);
    }
  }

  // Enqueue background job — returns immediately without waiting for Stellar
  const jobId = await enqueueClaim(gift.id, recipientStellarKey);

  if (gift.recipientEmail) {
    sendClaimConfirmationEmail(gift.recipientEmail, {
      recipientName: gift.recipientName,
      amountNgn: gift.amountNgn,
    }).catch((err: unknown) => console.error("[email] claim_confirmation failed:", err));
  }

  return { jobId };
}

// Re-export for direct use in background worker (bypasses queue for internal calls)
export { storeClaimTxHash, updateGiftStatus };
