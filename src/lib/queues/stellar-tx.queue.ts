/**
 * BullMQ queue for Stellar transaction submission.
 *
 * Decouples payment confirmation (Paystack callback) from blockchain submission
 * latency. The callback enqueues a job; a long-running worker processes it
 * asynchronously with automatic retries.
 */

import { Queue, Worker, Job } from "bullmq";
import { sendUsdcPayment, validateStellarAccount } from "@/lib/stellar";
import { updateGiftStatus, storeClaimTxHash, getGiftById } from "@/server/services/gift.service";
import { logger } from "@/lib/logger";

export const STELLAR_TX_QUEUE = "stellar-tx";

export interface ClaimJobData {
  type: "claim";
  giftId: string;
  recipientStellarKey: string;
}

export type StellarTxJobData = ClaimJobData;

// BullMQ requires ioredis-compatible connection options (not node-redis)
const redisConnection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
  password: process.env.REDIS_PASSWORD,
};

// ─── Queue singleton ──────────────────────────────────────────────────────────

let _queue: Queue | null = null;

export function getStellarTxQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(STELLAR_TX_QUEUE, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 2_000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
  }
  return _queue;
}

/**
 * Enqueues a claim job. Returns the BullMQ job ID.
 * Uses a deterministic jobId so duplicate enqueues are idempotent.
 */
export async function enqueueClaim(
  giftId: string,
  recipientStellarKey: string
): Promise<string> {
  const queue = getStellarTxQueue();
  const job = await queue.add(
    "claim",
    { type: "claim", giftId, recipientStellarKey } satisfies StellarTxJobData,
    { jobId: `claim:${giftId}` }
  );
  return job.id!;
}

// ─── Worker (run in a separate process or Next.js instrumentation hook) ───────

export function createStellarTxWorker(): Worker {
  return new Worker(
    STELLAR_TX_QUEUE,
    async (job: Job<StellarTxJobData>) => {
      const { type, giftId, recipientStellarKey } = job.data;

      if (type !== "claim") {
        throw new Error(`Unknown job type: ${type}`);
      }

      logger.info({ giftId, attempt: job.attemptsMade + 1 }, "stellar-tx worker: processing claim");

      const gift = await getGiftById(giftId);
      if (!gift) throw new Error(`Gift ${giftId} not found`);
      if (gift.status === "claimed") {
        logger.info({ giftId }, "stellar-tx worker: already claimed, skipping");
        return;
      }

      // Validate recipient account before submitting
      const check = await validateStellarAccount(recipientStellarKey);
      if (!check.valid) {
        // Mark as unrecoverable so BullMQ won't retry
        throw Object.assign(
          new Error(`Invalid recipient account: ${check.reason}`),
          { unrecoverable: true }
        );
      }

      const txHash = await sendUsdcPayment(recipientStellarKey, gift.amountUsdc);
      await storeClaimTxHash(giftId, txHash);
      await updateGiftStatus(giftId, "claimed");

      logger.info({ giftId, txHash }, "stellar-tx worker: claim complete");
    },
    {
      connection: redisConnection,
      concurrency: 3,
    }
  );
}
