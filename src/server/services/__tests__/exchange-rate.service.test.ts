/**
 * @jest-environment node
 */
import { getExchangeRate } from "../exchange-rate.service";
import { getRedisClient } from "@/lib/redis";

jest.mock("@/lib/redis", () => ({
  getRedisClient: jest.fn(),
}));

jest.mock("@/server/config", () => ({
  serverConfig: {
    stellar: { horizonUrl: "https://horizon.testnet.stellar.org" },
    usdc: { assetCode: "USDC", issuer: "GBBD" },
  },
}));

describe("ExchangeRateService", () => {
  let redisMock: any;

  beforeEach(() => {
    jest.clearAllMocks();
    redisMock = {
      get: jest.fn(),
      set: jest.fn(),
    };
    (getRedisClient as jest.Mock).mockResolvedValue(redisMock);
    global.fetch = jest.fn() as any;
  });

  it("returns cached fresh rate if available", async () => {
    const cachedData = { rate: 1500, timestamp: Date.now() - 100 * 1000 }; // 100s old
    redisMock.get.mockResolvedValue(JSON.stringify(cachedData));

    const result = await getExchangeRate();

    expect(result).toEqual({
      ngnPerUsdc: 1500,
      stale: false,
      source: "cache",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns stale rate and triggers background refresh", async () => {
    const cachedData = { rate: 1500, timestamp: Date.now() - 400 * 1000 }; // 400s old (> 300s)
    redisMock.get.mockResolvedValue(JSON.stringify(cachedData));
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ asks: [{ price: "1550" }] }),
    });

    const result = await getExchangeRate();

    expect(result).toEqual({
      ngnPerUsdc: 1500,
      stale: true,
      source: "cache",
    });
    
    // Wait for background refresh (it's fire and forget, so we need a small delay)
    await new Promise((r) => setTimeout(r, 10));
    expect(fetch).toHaveBeenCalled();
    expect(redisMock.set).toHaveBeenCalledWith(
      "rate:NGN:USDC",
      expect.stringContaining('"rate":1550'),
      { EX: 604800 }
    );
  });

  it("fetches fresh from Horizon on cache miss", async () => {
    redisMock.get.mockResolvedValue(null);
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ asks: [{ price: "1600" }] }),
    });

    const result = await getExchangeRate();

    expect(result).toEqual({
      ngnPerUsdc: 1600,
      stale: false,
      source: "horizon",
    });
    expect(redisMock.set).toHaveBeenCalled();
  });

  it("falls back to FALLBACK_RATE if Horizon and cache both fail", async () => {
    redisMock.get.mockResolvedValue(null);
    (fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

    const result = await getExchangeRate();

    expect(result).toEqual({
      ngnPerUsdc: 1600,
      stale: true,
      source: "fallback",
    });
  });
});
