import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ApiError } from "@/types";

type Handler = (_req: NextRequest, _context?: unknown) => Promise<NextResponse>;

/** Wraps a route handler — returns 401 if no session. */
export function withAuth(handler: Handler): Handler {
  return async (req, _context) => {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json<ApiError>(
        { success: false, error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }
    return handler(req, _context);
  };
}

/** Wraps a route handler with a try/catch — returns 500 on unhandled errors. */
export function withErrorHandler(handler: Handler): Handler {
  return async (req, context) => {
    try {
      return await handler(req, context);
    } catch (err) {
      console.error("[API Error]", err);
      return NextResponse.json<ApiError>(
        { success: false, error: "Internal server error", code: "INTERNAL_ERROR" },
        { status: 500 }
      );
    }
  };
}

/** Wraps a route handler — returns 401 if no session, 403 if not admin. */
export function withAdmin(handler: Handler): Handler {
  return async (req, context) => {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json<ApiError>(
        { success: false, error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }
    const user = session.user as { id: string; role?: string };
    if (user.role !== "admin") {
      return NextResponse.json<ApiError>(
        { success: false, error: "Forbidden", code: "FORBIDDEN" },
        { status: 403 }
      );
    }
    return handler(req, context);
  };
}

/** Rate-limit helper (simple in-memory; swap for Redis in production). */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) return false;

  entry.count++;
  return true;
}
