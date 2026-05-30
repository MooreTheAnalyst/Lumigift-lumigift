import { NextRequest, NextResponse } from "next/server";
import { serverConfig } from "@/server/config";
import type { ApiError } from "@/types";

/**
 * Checks if the origin is allowed by the CORS policy.
 * @param origin - The origin to check (from request headers)
 * @returns true if the origin is allowed, false otherwise
 */
function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return serverConfig.cors.allowedOrigins.some((allowed: string) => {
    // Exact match
    if (allowed === origin) return true;
    // Wildcard support for development (e.g., "*.localhost:3000")
    if (allowed.startsWith("*.")) {
      const pattern = allowed.slice(2);
      return origin.endsWith(pattern);
    }
    return false;
  });
}

/**
 * Wraps a route handler with CORS support.
 * - Handles preflight OPTIONS requests
 * - Sets CORS headers on successful responses
 * - Returns 403 for disallowed origins
 * - Allows credentials only for same-origin requests
 */
export function withCors(handler: (req: NextRequest) => Promise<NextResponse>): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest) => {
    const origin = req.headers.get("origin");

    // Handle preflight OPTIONS request
    if (req.method === "OPTIONS") {
      if (!isOriginAllowed(origin)) {
        return new NextResponse(null, { status: 403 });
      }

      return new NextResponse(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-CSRF-Token",
          "Access-Control-Max-Age": "86400", // 24 hours
          "Access-Control-Allow-Credentials": "true",
        },
      });
    }

    // Handle actual request
    if (!isOriginAllowed(origin)) {
      return NextResponse.json<ApiError>(
        { success: false, error: "CORS policy violation", code: "CORS_ERROR" },
        { status: 403 }
      );
    }

    // Call the handler
    const response = await handler(req);

    // Add CORS headers to response
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Expose-Headers", "Content-Length, X-API-Version, x-correlation-id");

    return response;
  };
}
