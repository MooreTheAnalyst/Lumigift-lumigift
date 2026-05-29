import { NextRequest, NextResponse } from "next/server";
import { verifyOtp } from "@/lib/otp";
import { withErrorHandler, withCsrf, validateRequest } from "@/server/middleware";
import { verifyOtpSchema } from "@/lib/schemas/auth";
import type { ApiResponse } from "@/types";

export const POST = withErrorHandler(withCsrf(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const validation = validateRequest(verifyOtpSchema, body);
  if (!validation.success) return validation.errorResponse;

  const { phone, otp } = validation.data;
  const result = await verifyOtp(phone, otp);

  if (!result.success) {
    const status = result.locked ? 429 : 401;
    const headers: Record<string, string> = {};
    if (result.locked && result.retryAfter) {
      headers["Retry-After"] = String(result.retryAfter);
    }
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: result.message },
      { status, headers }
    );
  }

  return NextResponse.json<ApiResponse<{ phone: string }>>(
    { success: true, data: { phone } }
  );
}));
