import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { withErrorHandler } from "@/server/middleware";
import type { ApiResponse } from "@/types";

/**
 * POST /api/v1/auth/report-login
 * Body: { userId: string; fingerprint: string }
 *
 * Also accepts GET with ?uid=&fp= so the SMS link works directly in a browser.
 */
async function handler(req: NextRequest): Promise<NextResponse> {
  let userId: string | null;
  let fingerprint: string | null;

  if (req.method === "GET") {
    const { searchParams } = new URL(req.url);
    userId = searchParams.get("uid");
    fingerprint = searchParams.get("fp");
  } else {
    const body = await req.json().catch(() => ({}));
    userId = body.userId ?? null;
    fingerprint = body.fingerprint ?? null;
  }

  if (!userId || !fingerprint) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "userId and fingerprint are required" },
      { status: 400 }
    );
  }

  await pool.query(
    `INSERT INTO suspicious_login_reports (user_id, fingerprint)
     VALUES ($1, $2)`,
    [userId, fingerprint]
  );

  return NextResponse.json<ApiResponse<{ message: string }>>({
    success: true,
    data: { message: "Report received. Our team will review your account shortly." },
  });
}

export const GET = withErrorHandler(handler);
export const POST = withErrorHandler(handler);
