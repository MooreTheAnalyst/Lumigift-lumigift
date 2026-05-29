/**
 * @jest-environment node
 *
 * Unit tests for src/server/services/admin.service.ts
 * Covers: adminGetAllGifts (filters), adminExpireGift,
 *         adminRefundGift, adminBanUser
 */

import type { Gift } from "@/types";

jest.mock("../gift.service", () => ({
  getGiftById: jest.fn(),
  updateGiftStatus: jest.fn(),
  getAllGifts: jest.fn(),
}));

import { getGiftById, updateGiftStatus, getAllGifts } from "../gift.service";
import {
  adminGetAllGifts,
  adminExpireGift,
  adminRefundGift,
  adminBanUser,
} from "../admin.service";

const mockGetGiftById = getGiftById as jest.Mock;
const mockUpdateGiftStatus = updateGiftStatus as jest.Mock;
const mockGetAllGifts = getAllGifts as jest.Mock;

function makeGift(overrides: Partial<Gift> = {}): Gift {
  return {
    id: "gift-1",
    senderId: "user-1",
    recipientPhoneHash: "hash",
    recipientName: "Ada",
    amountNgn: 5000,
    amountUsdc: "3.0",
    status: "locked",
    unlockAt: new Date("2026-12-25"),
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

// ─── adminGetAllGifts ─────────────────────────────────────────────────────────

describe("adminGetAllGifts", () => {
  it("returns all gifts when no filters applied", async () => {
    const gifts = [makeGift(), makeGift({ id: "gift-2", status: "claimed" })];
    mockGetAllGifts.mockResolvedValueOnce(gifts);
    const result = await adminGetAllGifts({});
    expect(result).toHaveLength(2);
  });

  it("filters by status", async () => {
    const gifts = [makeGift({ status: "locked" }), makeGift({ id: "gift-2", status: "claimed" })];
    mockGetAllGifts.mockResolvedValueOnce(gifts);
    const result = await adminGetAllGifts({ status: "locked" });
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("locked");
  });

  it("filters by userId", async () => {
    const gifts = [
      makeGift({ senderId: "user-1" }),
      makeGift({ id: "gift-2", senderId: "user-2" }),
    ];
    mockGetAllGifts.mockResolvedValueOnce(gifts);
    const result = await adminGetAllGifts({ userId: "user-1" });
    expect(result).toHaveLength(1);
    expect(result[0].senderId).toBe("user-1");
  });

  it("filters by from date", async () => {
    const old = makeGift({ createdAt: new Date("2025-01-01") });
    const recent = makeGift({ id: "gift-2", createdAt: new Date("2026-06-01") });
    mockGetAllGifts.mockResolvedValueOnce([old, recent]);
    const result = await adminGetAllGifts({ from: new Date("2026-01-01") });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("gift-2");
  });

  it("filters by to date", async () => {
    const old = makeGift({ createdAt: new Date("2025-01-01") });
    const recent = makeGift({ id: "gift-2", createdAt: new Date("2026-06-01") });
    mockGetAllGifts.mockResolvedValueOnce([old, recent]);
    const result = await adminGetAllGifts({ to: new Date("2025-12-31") });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("gift-1");
  });

  it("returns empty array when no gifts match filters", async () => {
    mockGetAllGifts.mockResolvedValueOnce([makeGift({ status: "locked" })]);
    const result = await adminGetAllGifts({ status: "claimed" });
    expect(result).toEqual([]);
  });
});

// ─── adminExpireGift ──────────────────────────────────────────────────────────

describe("adminExpireGift", () => {
  it("calls updateGiftStatus with expired", async () => {
    const expired = makeGift({ status: "expired" });
    mockUpdateGiftStatus.mockResolvedValueOnce(expired);
    const result = await adminExpireGift("gift-1");
    expect(mockUpdateGiftStatus).toHaveBeenCalledWith("gift-1", "expired");
    expect(result?.status).toBe("expired");
  });

  it("returns null when gift not found", async () => {
    mockUpdateGiftStatus.mockResolvedValueOnce(null);
    expect(await adminExpireGift("no-such-id")).toBeNull();
  });
});

// ─── adminRefundGift ──────────────────────────────────────────────────────────

describe("adminRefundGift", () => {
  it("cancels the gift and returns it", async () => {
    mockGetGiftById.mockResolvedValueOnce(makeGift());
    mockUpdateGiftStatus.mockResolvedValueOnce(makeGift({ status: "cancelled" }));
    const result = await adminRefundGift("gift-1");
    expect(mockUpdateGiftStatus).toHaveBeenCalledWith("gift-1", "cancelled");
    expect(result?.status).toBe("cancelled");
  });

  it("returns null when gift not found", async () => {
    mockGetGiftById.mockResolvedValueOnce(null);
    const result = await adminRefundGift("no-such-id");
    expect(result).toBeNull();
    expect(mockUpdateGiftStatus).not.toHaveBeenCalled();
  });
});

// ─── adminBanUser ─────────────────────────────────────────────────────────────

describe("adminBanUser", () => {
  it("bans a user and returns banned:true", async () => {
    const result = await adminBanUser("user-new");
    expect(result).toEqual({ id: "user-new", banned: true });
  });

  it("bans an already-known user", async () => {
    // First call creates the user stub
    await adminBanUser("user-known");
    // Second call should still return banned:true
    const result = await adminBanUser("user-known");
    expect(result).toEqual({ id: "user-known", banned: true });
  });
});
