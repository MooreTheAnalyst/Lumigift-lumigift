import { NextResponse } from "next/server";
import { withErrorHandler, rateLimit } from "@/server/middleware";
import { requireAdmin } from "@/server/middleware/admin";
import { adminListDeletedGifts, logAdminAction } from "@/server/services/admin-gift.service";
import type { ApiResponse, Gift } from "@/types";

export const GET = withErrorHandler(async () => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  if (!rateLimit(`admin:${auth.userId}`, 60, 60_000)) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429 }
    );
  }

  const deleted = adminListDeletedGifts();
  logAdminAction(auth.userId, "list_deleted_gifts", "all");

  return NextResponse.json<ApiResponse<Gift[]>>({ success: true, data: deleted });
});
