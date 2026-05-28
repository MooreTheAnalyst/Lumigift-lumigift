import { createHash } from "crypto";
import { NextRequest } from "next/server";

/**
 * Builds a stable device fingerprint from request headers.
 *
 * The fingerprint is a SHA-256 hash of the `User-Agent`, `Accept-Language`,
 * and `Accept-Encoding` headers. It is not cryptographically unique — it is
 * used only as a heuristic for "known device" detection.
 *
 * @param req - The incoming Next.js request.
 * @returns A 64-character hex string representing the device fingerprint.
 */
export function buildFingerprint(req: NextRequest): string {
  const ua = req.headers.get("user-agent") ?? "";
  const lang = req.headers.get("accept-language") ?? "";
  const encoding = req.headers.get("accept-encoding") ?? "";
  return createHash("sha256").update(`${ua}|${lang}|${encoding}`).digest("hex");
}

/**
 * Returns the client IP address from standard proxy headers.
 * Reads `X-Forwarded-For` and takes the first (leftmost) IP, which is the
 * original client IP when behind a trusted reverse proxy.
 *
 * @param req - The incoming Next.js request.
 * @returns The client IP string, or `"unknown"` if no forwarded header is present.
 */
export function getClientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

/**
 * Resolves an IP address to a country name using the ip-api.com free endpoint.
 * Falls back to `"Unknown location"` on any network error or unrecognised IP.
 *
 * @param ip - The IPv4 or IPv6 address to look up.
 * @returns The country name (e.g. `"Nigeria"`), or `"Unknown location"` on failure.
 */
export async function getCountryFromIp(ip: string): Promise<string> {
  if (ip === "unknown" || ip === "127.0.0.1" || ip.startsWith("::")) {
    return "Unknown location";
  }
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=country`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return "Unknown location";
    const { country } = (await res.json()) as { country?: string };
    return country ?? "Unknown location";
  } catch {
    return "Unknown location";
  }
}
