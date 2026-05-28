import { getRedisClient } from "@/lib/redis";
import { serverConfig } from "@/server/config";

const CACHE_KEY = "rate:NGN:USDC";
const CACHE_TTL_SEC = 300; // 5 minutes
const STALE_TTL_SEC = 604800; // 1 week (for fallback)
const FALLBACK_RATE = 1600; 
const LOCKED_RATE_TTL_SEC = 300; // 5 minutes
const MAX_SLIPPAGE_PERCENT = 1;

/** Shape returned by {@link getExchangeRate}. */
export interface ExchangeRateResult {
  ngnPerUsdc: number;
  stale: boolean;
  source: "cache" | "horizon" | "fallback";
}

interface CachedRate {
  rate: number;
  timestamp: number;
}

/**
 * Fetches the NGN/USDC rate from the Stellar Horizon order book.
 * Returns the price of the first ask.
 */
async function fetchFromHorizon(): Promise<number> {
  const url = `${serverConfig.stellar.horizonUrl}/order_book?selling_asset_type=native&buying_asset_type=credit_alphanum4&buying_asset_code=${serverConfig.usdc.assetCode}&buying_asset_issuer=${serverConfig.usdc.issuer}&limit=1`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Horizon responded ${res.status}`);
  const data = await res.json();
  const price = parseFloat(data?.asks?.[0]?.price ?? "0");
  if (!price) throw new Error("No asks in Horizon order book");
  return price;
}

/**
 * Refreshes the exchange rate in the background.
 */
async function refreshRate(): Promise<number> {
  try {
    const rate = await fetchFromHorizon();
    const redis = await getRedisClient();
    const data: CachedRate = { rate, timestamp: Date.now() };
    await redis.set(CACHE_KEY, JSON.stringify(data), { EX: STALE_TTL_SEC });
    console.log("[exchange-rate] refreshed and cached", { rate });
    return rate;
  } catch (err) {
    console.error("[exchange-rate] background refresh failed", err);
    throw err;
  }
}

/**
 * Returns the NGN/USDC exchange rate, using a Redis cache with SWR.
 */
export async function getExchangeRate(): Promise<ExchangeRateResult> {
  const redis = await getRedisClient();

  const cached = await redis.get(CACHE_KEY);
  if (cached) {
    try {
      const { rate, timestamp }: CachedRate = JSON.parse(cached);
      const ageSec = (Date.now() - timestamp) / 1000;

      if (ageSec < CACHE_TTL_SEC) {
        console.log("[exchange-rate] cache hit (fresh)", { ageSec });
        return { ngnPerUsdc: rate, stale: false, source: "cache" };
      }

      console.log("[exchange-rate] cache hit (stale), refreshing in background", { ageSec });
      refreshRate().catch(() => {}); // fire and forget
      return { ngnPerUsdc: rate, stale: true, source: "cache" };
    } catch (err) {
      console.error("[exchange-rate] failed to parse cache", err);
    }
  }

  console.log("[exchange-rate] cache miss, fetching synchronously");
  try {
    const rate = await refreshRate();
    return { ngnPerUsdc: rate, stale: false, source: "horizon" };
  } catch (err) {
    console.error("[exchange-rate] Horizon unreachable and no cache available", err);
    return { ngnPerUsdc: FALLBACK_RATE, stale: true, source: "fallback" };
  }
}

/**
 * Locks the current exchange rate for a gift, storing it in Redis for 5 minutes.
 * Call this at payment initiation time.
 *
 * @param giftId - The gift UUID to associate the locked rate with.
 * @returns The locked rate and its expiry timestamp.
 */
export async function lockExchangeRate(
  giftId: string
): Promise<{ lockedRate: number; expiresAt: number }> {
  const { ngnPerUsdc } = await getExchangeRate();
  const redis = await getRedisClient();
  const expiresAt = Math.floor(Date.now() / 1000) + LOCKED_RATE_TTL_SEC;
  await redis.setEx(`rate:locked:${giftId}`, LOCKED_RATE_TTL_SEC, String(ngnPerUsdc));
  return { lockedRate: ngnPerUsdc, expiresAt };
}

/**
 * Validates that the current rate has not deviated more than MAX_SLIPPAGE_PERCENT
 * from the rate locked at payment initiation.
 *
 * @param giftId - The gift UUID whose locked rate to compare against.
 * @returns `{ valid: true }` if within tolerance, or `{ valid: false, reason }` otherwise.
 */
export async function validateSlippage(
  giftId: string
): Promise<{ valid: boolean; reason?: string }> {
  const redis = await getRedisClient();
  const lockedStr = await redis.get(`rate:locked:${giftId}`);

  if (!lockedStr) {
    return { valid: false, reason: "rate_expired" };
  }

  const lockedRate = parseFloat(lockedStr);
  const { ngnPerUsdc: currentRate } = await getExchangeRate();
  const deviation = Math.abs(currentRate - lockedRate) / lockedRate * 100;

  if (deviation > MAX_SLIPPAGE_PERCENT) {
    return {
      valid: false,
      reason: `rate_deviated: locked=${lockedRate}, current=${currentRate}, deviation=${deviation.toFixed(2)}%`,
    };
  }

  return { valid: true };
}
