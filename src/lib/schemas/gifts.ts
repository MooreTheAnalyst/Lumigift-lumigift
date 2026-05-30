/**
 * @file gifts.ts
 * Zod schemas for gift API routes.
 * Shared between frontend (form validation) and backend (request validation).
 */

import { z } from "zod";
import { e164Phone, uuidSchema } from "./common";
import { formatNGN } from "@/lib/currency";

// ─── Path params ──────────────────────────────────────────────────────────────

export const giftIdParamSchema = z.object({
  id: uuidSchema,
});

export type GiftIdParam = z.infer<typeof giftIdParamSchema>;

// ─── Gift status enum ─────────────────────────────────────────────────────────

export const giftStatusSchema = z.enum([
  "draft",
  "pending_payment",
  "funded",
  "locked",
  "unlocked",
  "claimed",
  "expired",
  "cancelled",
]);

// ─── GET /api/v1/gifts — query params ────────────────────────────────────────

export const giftsQuerySchema = z
  .object({
    // Offset-based pagination
    page: z
      .string()
      .optional()
      .transform((v) => (v !== undefined ? parseInt(v, 10) : 1))
      .pipe(z.number().int().min(1, "page must be ≥ 1")),

    limit: z
      .string()
      .optional()
      .transform((v) => (v !== undefined ? parseInt(v, 10) : 10))
      .pipe(z.number().int().min(1).max(100, "limit must be ≤ 100")),

    status: giftStatusSchema.optional(),

    // Cursor-based pagination (legacy)
    cursor: z.string().optional(),

    pageSize: z
      .string()
      .optional()
      .transform((v) => (v !== undefined ? parseInt(v, 10) : 10))
      .pipe(z.number().int().min(1).max(100, "pageSize must be ≤ 100")),
  });

export type GiftsQuery = z.infer<typeof giftsQuerySchema>;

// ─── POST /api/v1/gifts — request body ───────────────────────────────────────

const GIFT_MIN = parseInt(process.env.GIFT_MIN_AMOUNT_NGN ?? "500", 10);
const GIFT_MAX = parseInt(process.env.GIFT_MAX_AMOUNT_NGN ?? "500000", 10);

export const createGiftSchema = z.object({
  recipientPhone: e164Phone,
  recipientName: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name cannot exceed 100 characters"),
  recipientEmail: z.string().email("Invalid email").optional().or(z.literal("").transform(() => undefined)),
  amountNgn: z
    .number()
    .min(GIFT_MIN, `Minimum gift amount is ${formatNGN(GIFT_MIN)}`)
    .max(GIFT_MAX, `Maximum gift amount is ${formatNGN(GIFT_MAX)}`),
  message: z.string().max(280, "Message cannot exceed 280 characters").optional(),
  voiceNoteUrl: z.string().url("voiceNoteUrl must be a valid URL").optional(),
  unlockAt: z
    .string()
    .datetime({ message: "unlockAt must be a valid ISO 8601 datetime" })
    .refine((val) => new Date(val) > new Date(), "Unlock date must be in the future"),
  paymentProvider: z.enum(["paystack", "stripe"], {
    message: "paymentProvider must be 'paystack' or 'stripe'",
  }),
  recipientIsRegistered: z.boolean().optional(),
  occasion: z
    .enum(["general", "birthday", "valentine", "anniversary", "graduation", "christmas"])
    .default("general"),
  notifyAt: z
    .string()
    .datetime({ message: "notifyAt must be a valid ISO 8601 datetime" })
    .optional()
    .refine(
      (val) => !val || new Date(val) > new Date(),
      "Notification time must be in the future"
    ),
})
.refine(
  (data) => !data.notifyAt || new Date(data.notifyAt) <= new Date(data.unlockAt),
  { message: "Notification time must be before or at the unlock time", path: ["notifyAt"] }
);

export type CreateGiftInput = z.infer<typeof createGiftSchema>;

// ─── POST /api/v1/gifts/[id]/claim — request body ────────────────────────────

export const claimGiftSchema = z.object({
  giftId: uuidSchema,
  recipientStellarKey: z
    .string()
    .length(56, "Stellar public key must be exactly 56 characters")
    .regex(/^G[A-Z2-7]{55}$/, "Invalid Stellar public key format"),
});

export type ClaimGiftInput = z.infer<typeof claimGiftSchema>;
