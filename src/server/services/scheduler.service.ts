/**
 * Unlock scheduler — checks for gifts whose `unlockAt` has passed and
 * transitions them from `"locked"` → `"unlocked"`, then notifies recipients.
 *
 * In production this should be triggered by a Vercel Cron job or pg_cron
 * at a regular interval (e.g. every minute).
 *
 * @returns The number of gifts that were unlocked in this run.
 */
// Placeholder: in production, query DB for all locked gifts past their unlockAt.
export async function processUnlocks(): Promise<number> {
  const now = new Date();
  // TODO: replace with DB query: SELECT * FROM gifts WHERE status='locked' AND unlock_at <= now
  console.warn("[scheduler] processUnlocks called — wire up DB query here", now);
  return 0; // return count of processed gifts
}

/**
 * Expiry scheduler — identifies gifts that have been `"unlocked"` but unclaimed
 * for more than 365 days, marks them as `"expired"`, and notifies the sender.
 *
 * When a gift expires the escrowed USDC should be refunded to the sender's
 * Stellar address via the escrow contract's cancel/refund path.
 *
 * In production, run daily via Vercel Cron or pg_cron.
 *
 * @returns Resolves when all expired gifts have been processed.
 */
export async function processExpiries(): Promise<void> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  // TODO: replace with DB query:
  //   SELECT * FROM gifts
  //   WHERE status = 'unlocked' AND unlock_at <= :cutoff
  console.warn(
    "[scheduler] processExpiries called — wire up DB query here. Cutoff:",
    cutoff.toISOString()
  );

  // Pseudocode for production implementation:
  //
  // const expiredGifts = await db.gift.findMany({
  //   where: { status: "unlocked", unlockAt: { lte: cutoff } },
  // });
  //
  // for (const gift of expiredGifts) {
  //   await updateGiftStatus(gift.id, "expired");
  //   // Refund USDC to sender's Stellar address
  //   if (gift.contractId && gift.senderStellarKey) {
  //     await refundEscrow(gift.contractId, gift.senderStellarKey);
  //   }
  //   // Notify sender via SMS
  //   await sendSms(gift.senderPhone, `Your Lumigift of ${gift.amountUsdc} USDC has expired and been refunded.`);
  // }
}
