/**
 * @jest-environment node
 *
 * Unit tests for src/server/services/audit.service.ts
 * Covers: createAuditLog, queryAuditLogs (all filter combinations)
 */

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

import pool from "@/lib/db";
import { createAuditLog, queryAuditLogs } from "../audit.service";

beforeEach(() => jest.clearAllMocks());

// ─── createAuditLog ───────────────────────────────────────────────────────────

describe("createAuditLog", () => {
  it("returns the inserted row id", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: "audit-uuid-1" }] });
    const id = await createAuditLog({ eventType: "gift_created", giftId: "g1" });
    expect(id).toBe("audit-uuid-1");
  });

  it("inserts with all optional fields as null when omitted", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: "audit-uuid-2" }] });
    await createAuditLog({ eventType: "payment_received" });
    const [, params] = (pool.query as jest.Mock).mock.calls[0];
    // userId, giftId, amountNgn, amountUsdc, ipAddress, userAgent, metadata
    expect(params[1]).toBeNull();
    expect(params[2]).toBeNull();
    expect(params[3]).toBeNull();
    expect(params[4]).toBeNull();
    expect(params[5]).toBeNull();
    expect(params[6]).toBeNull();
    expect(params[7]).toBeNull();
  });

  it("serialises metadata to JSON", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: "audit-uuid-3" }] });
    const meta = { provider: "paystack", ref: "ref_123" };
    await createAuditLog({ eventType: "gift_funded", metadata: meta });
    const [, params] = (pool.query as jest.Mock).mock.calls[0];
    expect(params[7]).toBe(JSON.stringify(meta));
  });

  it("passes all provided fields to the query", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: "audit-uuid-4" }] });
    await createAuditLog({
      eventType: "gift_claimed",
      userId: "user-1",
      giftId: "gift-1",
      amountNgn: 5000,
      amountUsdc: "3.0",
      ipAddress: "127.0.0.1",
      userAgent: "Mozilla/5.0",
    });
    const [, params] = (pool.query as jest.Mock).mock.calls[0];
    expect(params[0]).toBe("gift_claimed");
    expect(params[1]).toBe("user-1");
    expect(params[2]).toBe("gift-1");
    expect(params[3]).toBe(5000);
    expect(params[4]).toBe("3.0");
    expect(params[5]).toBe("127.0.0.1");
    expect(params[6]).toBe("Mozilla/5.0");
  });

  it("propagates DB errors", async () => {
    (pool.query as jest.Mock).mockRejectedValueOnce(new Error("DB down"));
    await expect(createAuditLog({ eventType: "gift_cancelled" })).rejects.toThrow("DB down");
  });
});

// ─── queryAuditLogs ───────────────────────────────────────────────────────────

const EMPTY_COUNT = { rows: [{ count: "0" }] };
const LOG_ROW = {
  id: "log-1",
  event_type: "gift_created" as const,
  user_id: "user-1",
  gift_id: "gift-1",
  amount_ngn: 5000,
  amount_usdc: "3.0",
  timestamp: new Date("2026-01-01"),
  ip_address: "127.0.0.1",
  user_agent: "Mozilla",
  metadata: null,
};

describe("queryAuditLogs", () => {
  it("returns logs and total with no filters", async () => {
    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ count: "1" }] })
      .mockResolvedValueOnce({ rows: [LOG_ROW] });

    const result = await queryAuditLogs({});
    expect(result.total).toBe(1);
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].eventType).toBe("gift_created");
  });

  it("maps snake_case DB columns to camelCase", async () => {
    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ count: "1" }] })
      .mockResolvedValueOnce({ rows: [LOG_ROW] });

    const { logs } = await queryAuditLogs({});
    expect(logs[0]).toMatchObject({
      id: "log-1",
      eventType: "gift_created",
      userId: "user-1",
      giftId: "gift-1",
      amountNgn: 5000,
      amountUsdc: "3.0",
      ipAddress: "127.0.0.1",
      userAgent: "Mozilla",
    });
  });

  it("applies userId filter", async () => {
    (pool.query as jest.Mock)
      .mockResolvedValueOnce(EMPTY_COUNT)
      .mockResolvedValueOnce({ rows: [] });

    await queryAuditLogs({ userId: "user-1" });
    const [countSql] = (pool.query as jest.Mock).mock.calls[0];
    expect(countSql).toContain("user_id = $1");
  });

  it("applies giftId filter", async () => {
    (pool.query as jest.Mock)
      .mockResolvedValueOnce(EMPTY_COUNT)
      .mockResolvedValueOnce({ rows: [] });

    await queryAuditLogs({ giftId: "gift-1" });
    const [countSql] = (pool.query as jest.Mock).mock.calls[0];
    expect(countSql).toContain("gift_id = $1");
  });

  it("applies eventType filter", async () => {
    (pool.query as jest.Mock)
      .mockResolvedValueOnce(EMPTY_COUNT)
      .mockResolvedValueOnce({ rows: [] });

    await queryAuditLogs({ eventType: "payment_received" });
    const [countSql] = (pool.query as jest.Mock).mock.calls[0];
    expect(countSql).toContain("event_type = $1");
  });

  it("applies startDate and endDate filters", async () => {
    (pool.query as jest.Mock)
      .mockResolvedValueOnce(EMPTY_COUNT)
      .mockResolvedValueOnce({ rows: [] });

    await queryAuditLogs({
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
    });
    const [countSql] = (pool.query as jest.Mock).mock.calls[0];
    expect(countSql).toContain("timestamp >=");
    expect(countSql).toContain("timestamp <=");
  });

  it("uses default limit=50 and offset=0", async () => {
    (pool.query as jest.Mock)
      .mockResolvedValueOnce(EMPTY_COUNT)
      .mockResolvedValueOnce({ rows: [] });

    await queryAuditLogs({});
    const [, params] = (pool.query as jest.Mock).mock.calls[1];
    expect(params).toContain(50);
    expect(params).toContain(0);
  });

  it("respects custom limit and offset", async () => {
    (pool.query as jest.Mock)
      .mockResolvedValueOnce(EMPTY_COUNT)
      .mockResolvedValueOnce({ rows: [] });

    await queryAuditLogs({ limit: 10, offset: 20 });
    const [, params] = (pool.query as jest.Mock).mock.calls[1];
    expect(params).toContain(10);
    expect(params).toContain(20);
  });

  it("returns empty logs array when no rows match", async () => {
    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ count: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await queryAuditLogs({ userId: "nobody" });
    expect(result.total).toBe(0);
    expect(result.logs).toEqual([]);
  });
});
