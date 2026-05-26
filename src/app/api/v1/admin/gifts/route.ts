import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler, rateLimit } from "@/server/middleware";
import { requireAdmin } from "@/server/middleware/admin";
import { adminListGifts, logAdminAction, type AdminGiftPage } from "@/server/services/admin-gift.service";
import type { ApiResponse, GiftStatus } from "@/types";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  // Rate-limit: 60 requests per minute per admin
  if (!rateLimit(`admin:${auth.userId}`, 60, 60_000)) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429 }
    );
  }

  const { searchParams } = req.nextUrl;
  const page = adminListGifts({
    search: searchParams.get("search") ?? undefined,
    status: (searchParams.get("status") as GiftStatus) ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
    limit: searchParams.has("limit") ? Number(searchParams.get("limit")) : undefined,
  });

  logAdminAction(auth.userId, "list_gifts", "all");

  return NextResponse.json<ApiResponse<AdminGiftPage>>({ success: true, data: page });
});
