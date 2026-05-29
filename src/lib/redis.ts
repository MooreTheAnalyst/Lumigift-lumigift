import { createClient, createSentinel } from "redis";
import { serverConfig } from "@/server/config";

let client: any = null;

/**
 * Returns a connected Redis client, creating and connecting one on first call.
 * Subsequent calls return the same singleton instance.
 *
 * @returns A connected `redis` client instance.
 * @throws Will throw if the initial connection to Redis fails.
 */
export async function getRedisClient() {
  if (!client) {
    const { redis: config } = serverConfig;

    if (config.useSentinel) {
      if (!config.sentinelHosts) {
        throw new Error("REDIS_SENTINEL_HOSTS is required when REDIS_USE_SENTINEL is true");
      }

      const sentinels = config.sentinelHosts.split(",").map((hostPort) => {
        const [host, port] = hostPort.split(":");
        return {
          host: host.trim(),
          port: parseInt(port?.trim(), 10) || 26379,
        };
      });

      client = createSentinel({
        name: config.sentinelName,
        sentinelRootNodes: sentinels,
        sentinelClientOptions: config.sentinelPassword
          ? { password: config.sentinelPassword }
          : undefined,
        nodeClientOptions: config.password ? { password: config.password } : undefined,
      });
    } else {
      client = createClient({ url: config.url });
    }

    client.on("error", (err: Error) => console.error("[Redis Error]", err));
    client.on("connect", () => console.log("[Redis] Connecting..."));
    client.on("ready", () => console.log("[Redis] Client ready"));
    client.on("reconnecting", () => console.log("[Redis] Reconnecting..."));

    await client.connect();
  }
  return client;
}

/**
 * Named export of the raw redis client getter for services that import `redis` directly.
 * @deprecated Use `getRedisClient()` instead.
 */
export const redis = {
  get: async (key: string) => (await getRedisClient()).get(key),
  set: async (key: string, value: string) => (await getRedisClient()).set(key, value),
  setEx: async (key: string, ttl: number, value: string) =>
    (await getRedisClient()).setEx(key, ttl, value),
  del: async (key: string) => (await getRedisClient()).del(key),
  incr: async (key: string) => (await getRedisClient()).incr(key),
  expire: async (key: string, ttl: number) => (await getRedisClient()).expire(key, ttl),
  ttl: async (key: string) => (await getRedisClient()).ttl(key),
};
