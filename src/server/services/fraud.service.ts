import pool from "@/lib/db";
import { serviceLogger } from "@/lib/logger";
import { createHash } from "crypto";

const log = serviceLogger("fraud-detection");

export interface FraudCheckResult {
  flagged: boolean;
  reasons: string[];
  severity: "low" | "medium" | "high";
}

export interface FraudFlag {
  id: string;
  giftId: string;
  userId: string;
  flagType: string;
  reason: string;
  severity: "low" | "medium" | "high";
  metadata: Record<string, unknown>;
  reviewed: boolean;
  createdAt: Date;
}

/**
 * Checks if a gift should be flagged for fraud review based on multiple rules.
 */
export async function checkGiftForFraud(
  userId: string,
  recipientPhone: string,
  amountNgn: number,
  userCreatedAt: Date
): Promise<FraudCheckResult> {
  const reasons: string[] = [];
  let severity: "low" | "medium" | "high" = "low";

  // Rule 1: >5 gifts to same recipient in 24h
  const recipientPhoneHash = hashPhone(recipientPhone);
  const giftsToRecipient = await countGiftsToRecipientLast24h(userId, recipientPhoneHash);
  
  if (giftsToRecipient >= 5) {
    reasons.push(`More than 5 gifts to same recipient in 24h (${giftsToRecipient} gifts)`);
    severity = "high";
  }

  // Rule 2: Single gift > 500,000 NGN
  if (amountNgn > 500000) {
    reasons.push(`Large gift amount: ₦${amountNgn.toLocaleString()}`);
    severity = severity === "high" ? "high" : "medium";
  }

  // Rule 3: Account < 1 hour old sending > 3 gifts
  const accountAgeHours = (Date.now() - userCreatedAt.getTime()) / (1000 * 60 * 60);
  
  if (accountAgeHours < 1) {
    const giftsCount = await countUserGiftsLast24h(userId);
    
    if (giftsCount >= 3) {
      reasons.push(`New account (${Math.round(accountAgeHours * 60)}min old) sending multiple gifts (${giftsCount + 1} total)`);
      severity = "high";
    }
  }

  // Rule 4: Rapid succession gifts (>3 gifts in 10 minutes)
  const recentGifts = await countUserGiftsLastMinutes(userId, 10);
  
  if (recentGifts >= 3) {
    reasons.push(`Rapid gift creation: ${recentGifts} gifts in 10 minutes`);
    severity = "high";
  }

  return {
    flagged: reasons.length > 0,
    reasons,
    severity,
  };
}

/**
 * Creates a fraud flag record for manual review.
 */
export async function createFraudFlag(
  giftId: string,
  userId: string,
  flagType: string,
  reason: string,
  severity: "low" | "medium" | "high",
  metadata: Record<string, unknown> = {}
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO fraud_flags (
      gift_id,
      user_id,
      flag_type,
      reason,
      severity,
      metadata
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id`,
    [giftId, userId, flagType, reason, severity, JSON.stringify(metadata)]
  );

  log.warn(
    {
      giftId,
      userId,
      flagType,
      severity,
      reason,
    },
    "Gift flagged for fraud review"
  );

  // In production, send notification to admin via email/Slack
  await notifyAdminOfFraudFlag(giftId, userId, reason, severity);

  return result.rows[0].id;
}

/**
 * Retrieves all unreviewed fraud flags.
 */
export async function getUnreviewedFraudFlags(): Promise<FraudFlag[]> {
type FraudFlagRow = {
    id: string;
    gift_id: string;
    user_id: string;
    flag_type: string;
    reason: string;
    severity: "low" | "medium" | "high";
    metadata: Record<string, unknown>;
    reviewed: boolean;
    created_at: Date;
  };

  const result = await pool.query<FraudFlagRow>(
    `SELECT
      id,
      gift_id,
      user_id,
      flag_type,
      reason,
      severity,
      metadata,
      reviewed,
      created_at
    FROM fraud_flags
    WHERE reviewed = false
    ORDER BY severity DESC, created_at DESC`
  );

  return result.rows.map((row: FraudFlagRow) => ({
    id: row.id,
    giftId: row.gift_id,
    userId: row.user_id,
    flagType: row.flag_type,
    reason: row.reason,
    severity: row.severity,
    metadata: row.metadata,
    reviewed: row.reviewed,
    createdAt: row.created_at,
  }));
}

/**
 * Marks a fraud flag as reviewed.
 */
export async function markFraudFlagReviewed(
  flagId: string,
  reviewedBy: string,
  action: "approved" | "rejected",
  notes?: string
): Promise<void> {
  await pool.query(
    `UPDATE fraud_flags
    SET reviewed = true,
        reviewed_by = $2,
        review_action = $3,
        review_notes = $4,
        reviewed_at = NOW()
    WHERE id = $1`,
    [flagId, reviewedBy, action, notes ?? null]
  );

  log.info({ flagId, reviewedBy, action }, "Fraud flag reviewed");
}

/**
 * Checks if a gift is currently flagged for fraud.
 */
export async function isGiftFlagged(giftId: string): Promise<boolean> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count
    FROM fraud_flags
    WHERE gift_id = $1 AND reviewed = false`,
    [giftId]
  );

  return parseInt(result.rows[0].count, 10) > 0;
}

// Helper functions

function hashPhone(phone: string): string {
  return createHash("sha256").update(phone).digest("hex");
}

async function countGiftsToRecipientLast24h(
  userId: string,
  recipientPhoneHash: string
): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count
    FROM gifts
    WHERE sender_id = $1
      AND recipient_phone_hash = $2
      AND created_at > NOW() - INTERVAL '24 hours'`,
    [userId, recipientPhoneHash]
  );

  return parseInt(result.rows[0].count, 10);
}

async function countUserGiftsLast24h(userId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count
    FROM gifts
    WHERE sender_id = $1
      AND created_at > NOW() - INTERVAL '24 hours'`,
    [userId]
  );

  return parseInt(result.rows[0].count, 10);
}

async function countUserGiftsLastMinutes(userId: string, minutes: number): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count
    FROM gifts
    WHERE sender_id = $1
      AND created_at > NOW() - INTERVAL '${minutes} minutes'`,
    [userId]
  );

  return parseInt(result.rows[0].count, 10);
}

async function notifyAdminOfFraudFlag(
  giftId: string,
  userId: string,
  reason: string,
  severity: "low" | "medium" | "high"
): Promise<void> {
  // TODO: Implement actual notification (email/Slack)
  // For now, just log
  log.warn(
    {
      event: "fraud_flag_notification",
      giftId,
      userId,
      reason,
      severity,
    },
    "Admin notification: Gift flagged for fraud review"
  );

  // Example Slack webhook implementation:
  // const webhookUrl = process.env.SLACK_FRAUD_WEBHOOK_URL;
  // if (webhookUrl) {
  //   await fetch(webhookUrl, {
  //     method: "POST",
  //     headers: { "Content-Type": "application/json" },
  //     body: JSON.stringify({
  //       text: `🚨 Fraud Alert: Gift ${giftId} flagged`,
  //       blocks: [
  //         {
  //           type: "section",
  //           text: {
  //             type: "mrkdwn",
  //             text: `*Severity:* ${severity}\n*Reason:* ${reason}\n*Gift ID:* ${giftId}\n*User ID:* ${userId}`,
  //           },
  //         },
  //       ],
  //     }),
  //   });
  // }
}
