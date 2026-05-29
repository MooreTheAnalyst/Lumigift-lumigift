import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler, rateLimit, validateRequest } from "@/server/middleware";
import { requireAdmin } from "@/server/middleware/admin";
import { adminGetGift, logAdminAction } from "@/server/services/admin-gift.service";
import { restoreGift, softDeleteGift } from "@/server/services/gift.service";
import { giftIdParamSchema } from "@/lib/schemas";
import type { ApiResponse, Gift } from "@/types";

/** POST /api/v1/admin/gifts/[id]/restore — restore a soft-deleted gift */
export const POST = withErrorHandler(async (_req: NextRequest, context: unknown) => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  if (!rateLimit(`admin:${auth.userId}`, 60, 60_000)) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429 }
    );
  }

  const { params } = context as { params: { id: string } };
  const paramValidation = validateRequest(giftIdParamSchema, params);
  if (!paramValidation.success) return paramValidation.errorResponse;

  const gift = adminGetGift(paramValidation.data.id);
  if (!gift) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Gift not found" },
      { status: 404 }
    );
  }

  if (!gift.deletedAt) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Gift is not deleted" },
      { status: 409 }
    );
  }

  const restored = await restoreGift(gift.id);
  logAdminAction(auth.userId, "restore_gift", gift.id);

  return NextResponse.json<ApiResponse<Gift>>({ success: true, data: restored! });
});

/** DELETE /api/v1/admin/gifts/[id]/restore — hard delete (explicit admin confirmation) */
export const DELETE = withErrorHandler(async (_req: NextRequest, context: unknown) => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  if (!rateLimit(`admin:${auth.userId}`, 10, 60_000)) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429 }
    );
  }

  const { params } = context as { params: { id: string } };
  const paramValidation = validateRequest(giftIdParamSchema, params);
  if (!paramValidation.success) return paramValidation.errorResponse;

  const gift = adminGetGift(paramValidation.data.id);
  if (!gift) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Gift not found" },
      { status: 404 }
    );
  }

  // Ensure it was soft-deleted first before allowing hard delete
  if (!gift.deletedAt) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Gift must be soft-deleted before hard delete" },
      { status: 409 }
    );
  }

  // Hard delete: remove from in-memory store
  const { gifts } = await import("@/server/services/gift.service");
  gifts.delete(gift.id);
  logAdminAction(auth.userId, "hard_delete_gift", gift.id);

  return NextResponse.json<ApiResponse<{ id: string }>>({
    success: true,
    data: { id: gift.id },
  });
});
