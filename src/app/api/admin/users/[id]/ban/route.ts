import { NextRequest, NextResponse } from "next/server";
import { withAdmin, withErrorHandler } from "@/server/middleware";
import { adminBanUser } from "@/server/services/admin.service";
import type { ApiResponse } from "@/types";

export const POST = withErrorHandler(
  withAdmin(async (_req: NextRequest, context: unknown) => {
    const { params } = context as { params: { id: string } };
    const result = await adminBanUser(params.id);

    if (!result) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json<ApiResponse<{ id: string; banned: boolean }>>({
      success: true,
      data: result,
    });
  })
);
