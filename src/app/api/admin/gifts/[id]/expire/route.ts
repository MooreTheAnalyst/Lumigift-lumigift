import { NextRequest, NextResponse } from "next/server";
import { withAdmin, withErrorHandler } from "@/server/middleware";
import { adminExpireGift } from "@/server/services/admin.service";
import type { ApiResponse, Gift } from "@/types";

export const POST = withErrorHandler(
  withAdmin(async (_req: NextRequest, context: unknown) => {
    const { params } = context as { params: { id: string } };
    const gift = await adminExpireGift(params.id);

    if (!gift) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Gift not found" },
        { status: 404 }
      );
    }

    return NextResponse.json<ApiResponse<Gift>>({ success: true, data: gift });
  })
);
