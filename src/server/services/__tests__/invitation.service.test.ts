/**
 * @jest-environment node
 *
 * Unit tests for src/server/services/invitation.service.ts
 * Covers: createGiftInvitation, validateInvitationToken,
 *         acceptInvitation, claimInvitation, getInvitationByPhoneAndGift
 */

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

import pool from "@/lib/db";
import {
  createGiftInvitation,
  validateInvitationToken,
  acceptInvitation,
  claimInvitation,
  getInvitationByPhoneAndGift,
} from "../invitation.service";

beforeEach(() => jest.clearAllMocks());

// ─── createGiftInvitation ─────────────────────────────────────────────────────

describe("createGiftInvitation", () => {
  it("returns a 64-character hex token", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
    const token = await createGiftInvitation("gift-1", "hash-abc", "+2348012345678");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("inserts with the correct gift_id and phone hash", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
    await createGiftInvitation("gift-42", "hash-xyz", "+2348099999999");
    const [sql, params] = (pool.query as jest.Mock).mock.calls[0];
    expect(sql).toContain("INSERT INTO gift_invitations");
    expect(params[1]).toBe("gift-42");
    expect(params[2]).toBe("hash-xyz");
    expect(params[3]).toBe("+2348099999999");
  });

  it("sets expires_at ~30 days in the future", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
    await createGiftInvitation("gift-1", "hash", "+2348012345678");
    const [, params] = (pool.query as jest.Mock).mock.calls[0];
    const expiresAt: Date = params[5];
    const diffDays = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(29);
    expect(diffDays).toBeLessThan(31);
  });

  it("generates a unique token on each call", async () => {
    (pool.query as jest.Mock).mockResolvedValue({ rows: [] });
    const t1 = await createGiftInvitation("g1", "h1", "+2348011111111");
    const t2 = await createGiftInvitation("g2", "h2", "+2348022222222");
    expect(t1).not.toBe(t2);
  });

  it("propagates DB errors", async () => {
    (pool.query as jest.Mock).mockRejectedValueOnce(new Error("constraint violation"));
    await expect(
      createGiftInvitation("gift-1", "hash", "+2348012345678")
    ).rejects.toThrow("constraint violation");
  });
});

// ─── validateInvitationToken ──────────────────────────────────────────────────

describe("validateInvitationToken", () => {
  const ROW = {
    id: "inv-1",
    gift_id: "gift-1",
    recipient_phone_hash: "hash-abc",
    recipient_phone: "+2348012345678",
    expires_at: new Date(Date.now() + 86_400_000),
  };

  it("returns invitation details for a valid token", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [ROW] });
    const result = await validateInvitationToken("valid-token");
    expect(result).toMatchObject({
      id: "inv-1",
      giftId: "gift-1",
      recipientPhoneHash: "hash-abc",
      recipientPhone: "+2348012345678",
    });
    expect(result?.expiresAt).toBeInstanceOf(Date);
  });

  it("returns null when token is not found or expired", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
    const result = await validateInvitationToken("expired-token");
    expect(result).toBeNull();
  });

  it("queries with the correct token and status=pending filter", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
    await validateInvitationToken("tok-abc");
    const [sql, params] = (pool.query as jest.Mock).mock.calls[0];
    expect(sql).toContain("status = 'pending'");
    expect(params[0]).toBe("tok-abc");
  });
});

// ─── acceptInvitation ────────────────────────────────────────────────────────

describe("acceptInvitation", () => {
  it("returns true when a row is updated", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rowCount: 1 });
    expect(await acceptInvitation("inv-1")).toBe(true);
  });

  it("returns false when no row is found", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rowCount: 0 });
    expect(await acceptInvitation("no-such-id")).toBe(false);
  });

  it("sets status to accepted", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rowCount: 1 });
    await acceptInvitation("inv-1");
    const [sql] = (pool.query as jest.Mock).mock.calls[0];
    expect(sql).toContain("status = 'accepted'");
  });
});

// ─── claimInvitation ─────────────────────────────────────────────────────────

describe("claimInvitation", () => {
  it("returns true when a row is updated", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rowCount: 1 });
    expect(await claimInvitation("inv-1")).toBe(true);
  });

  it("returns false when no row is found", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rowCount: 0 });
    expect(await claimInvitation("no-such-id")).toBe(false);
  });

  it("sets status to claimed", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rowCount: 1 });
    await claimInvitation("inv-1");
    const [sql] = (pool.query as jest.Mock).mock.calls[0];
    expect(sql).toContain("status = 'claimed'");
  });
});

// ─── getInvitationByPhoneAndGift ──────────────────────────────────────────────

describe("getInvitationByPhoneAndGift", () => {
  it("returns id and status when found", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({
      rows: [{ id: "inv-1", status: "pending" }],
    });
    const result = await getInvitationByPhoneAndGift("+2348012345678", "gift-1");
    expect(result).toEqual({ id: "inv-1", status: "pending" });
  });

  it("returns null when not found", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
    const result = await getInvitationByPhoneAndGift("+2340000000000", "gift-x");
    expect(result).toBeNull();
  });

  it("queries by recipient_phone and gift_id", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
    await getInvitationByPhoneAndGift("+2348012345678", "gift-99");
    const [sql, params] = (pool.query as jest.Mock).mock.calls[0];
    expect(sql).toContain("recipient_phone = $1");
    expect(sql).toContain("gift_id = $2");
    expect(params[0]).toBe("+2348012345678");
    expect(params[1]).toBe("gift-99");
  });
});
