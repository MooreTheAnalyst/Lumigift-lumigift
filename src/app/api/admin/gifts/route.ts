import { NextRequest, NextResponse } from "next/server";
import { withAdmin, withErrorHandler } from "@/server/middleware";
import { adminGetAllGifts } from "@/server/services/admin.service";
import type { ApiResponse, Gift, GiftStatus } from "@/types";

export const GET = withErrorHandler(
  withAdmin(async (req: NextRequest) => {
    const { searchParams } = req.nextUrl;
    const status = searchParams.get("status") as GiftStatus | null;
    const userId = searchParams.get("userId") ?? undefined;
    const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : undefined;
    const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : undefined;

    const gifts = await adminGetAllGifts({ status: status ?? undefined, userId, from, to });
    return NextResponse.json<ApiResponse<Gift[]>>({ success: true, data: gifts });
  })
);
