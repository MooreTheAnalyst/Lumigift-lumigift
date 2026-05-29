/**
 * @jest-environment node
 *
 * Unit tests for src/server/services/claim.service.ts
 *
 * Mocks:
 *  - @/lib/stellar           → validateStellarAccount
 *  - @/lib/queues/stellar-tx.queue → enqueueClaim
 *
 * Covers: successful claim enqueuing, invalid recipient account,
 *         and gift status guards.
 */

import type { Gift } from "@/types";

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("@/lib/stellar", () => ({
  validateStellarAccount: jest.fn().mockResolvedValue({ valid: true }),
}));

jest.mock("@/lib/queues/stellar-tx.queue", () => ({
  enqueueClaim: jest.fn().mockResolvedValue("job-id-abc123"),
}));

jest.mock("../gift.service", () => ({
  updateGiftStatus: jest.fn(),
  storeClaimTxHash: jest.fn(),
}));

// SMS (Termii) — claim.service doesn't call it directly, but guard against
// accidental real network calls if the service is extended.
jest.mock("@/lib/sms", () => ({
  sendNewDeviceAlert: jest.fn(),
  sendOtp: jest.fn(),
}));

import { claimGift } from "../claim.service";
import { validateStellarAccount } from "@/lib/stellar";
import { enqueueClaim } from "@/lib/queues/stellar-tx.queue";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGift(overrides: Partial<Gift> = {}): Gift {
  return {
    id: "gift-abc-123",
    senderId: "sender-1",
    recipientPhoneHash: "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
    recipientName: "Ada Obi",
    amountNgn: 5000,
    amountUsdc: "3.0000000",
    unlockAt: new Date(Date.now() - 1000), // already past
    status: "unlocked",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const RECIPIENT_KEY = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFLA5";

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  (validateStellarAccount as jest.Mock).mockResolvedValue({ valid: true });
  (enqueueClaim as jest.Mock).mockResolvedValue("job-id-abc123");
});

describe("claimGift", () => {
  it("enqueues a claim job and returns the job id", async () => {
    const gift = makeGift();
    const result = await claimGift(gift, RECIPIENT_KEY);
    expect(result).toEqual({ jobId: "job-id-abc123" });
    expect(enqueueClaim).toHaveBeenCalledWith(gift.id, RECIPIENT_KEY);
  });

  it("validates the recipient Stellar account before enqueuing", async () => {
    (validateStellarAccount as jest.Mock).mockResolvedValue({
      valid: false,
      reason: "Stellar account does not exist",
    });

    const gift = makeGift();
    await expect(claimGift(gift, RECIPIENT_KEY)).rejects.toThrow(
      "Invalid recipient Stellar account: Stellar account does not exist"
    );
    expect(enqueueClaim).not.toHaveBeenCalled();
  });

  it("throws when the gift is not yet unlocked", async () => {
    const gift = makeGift({ status: "locked" });
    await expect(claimGift(gift, RECIPIENT_KEY)).rejects.toThrow(
      "Gift is not yet unlocked."
    );
    expect(enqueueClaim).not.toHaveBeenCalled();
  });

  it("throws when the gift is already claimed", async () => {
    const gift = makeGift({ status: "claimed" });
    await expect(claimGift(gift, RECIPIENT_KEY)).rejects.toThrow(
      "Gift is not yet unlocked."
    );
    expect(enqueueClaim).not.toHaveBeenCalled();
  });
});
