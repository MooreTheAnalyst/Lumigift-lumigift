import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandler, withCsrf, validateRequest } from "@/server/middleware";
import { getGiftsBySender } from "@/server/services/gift.service";
import { z } from "zod";
import type { ApiResponse } from "@/types";

const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(60).optional(),
  notificationPreferences: z
    .object({
      sms: z.boolean(),
      email: z.boolean(),
    })
    .optional(),
});

export type ProfileStats = {
  totalGiftsSent: number;
  totalValueNgn: number;
  claimRate: number;
  memberSince: string;
  displayName: string;
  phone: string;
};

/** GET /api/v1/profile — returns stats + gift history for the authenticated user */
export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  const userId = (session.user as { id: string }).id;
  const gifts = await getGiftsBySender(userId);

  const totalGiftsSent = gifts.length;
  const totalValueNgn = gifts.reduce((sum, g) => sum + g.amountNgn, 0);
  const claimed = gifts.filter((g) => g.status === "claimed").length;
  const claimRate = totalGiftsSent > 0 ? Math.round((claimed / totalGiftsSent) * 100) : 0;

  const stats: ProfileStats = {
    totalGiftsSent,
    totalValueNgn,
    claimRate,
    memberSince: (session.user as { createdAt?: string }).createdAt ?? new Date().toISOString(),
    displayName: session.user.name ?? "",
    phone: (session.user as { phone?: string }).phone ?? "",
  };

  return NextResponse.json<ApiResponse<{ stats: ProfileStats; gifts: typeof gifts }>>({
    success: true,
    data: { stats, gifts },
  });
});

/** PATCH /api/v1/profile — update display name or notification preferences */
export const PATCH = withErrorHandler(
  withCsrf(async (req: NextRequest) => {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const validation = validateRequest(updateProfileSchema, body);
    if (!validation.success) return validation.errorResponse;

    // TODO: persist to DB — UPDATE users SET display_name=$1 WHERE id=$2
    return NextResponse.json<ApiResponse<{ updated: true }>>({
      success: true,
      data: { updated: true },
    });
  })
);

/** DELETE /api/v1/profile — schedule account deletion */
export const DELETE = withErrorHandler(
  withCsrf(async (_req: NextRequest) => {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // TODO: soft-delete — UPDATE users SET deleted_at=NOW() WHERE id=$1
    // Cancel any pending gifts, refund escrowed USDC, then anonymise PII.
    return NextResponse.json<ApiResponse<{ scheduled: true }>>({
      success: true,
      data: { scheduled: true },
    });
  })
);
