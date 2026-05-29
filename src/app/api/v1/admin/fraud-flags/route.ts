import { NextRequest, NextResponse } from "next/server";
import { withAdmin, withErrorHandler } from "@/server/middleware";
import { getUnreviewedFraudFlags } from "@/server/services/fraud.service";

export const GET = withErrorHandler(
  withAdmin(async (_req: NextRequest) => {
    const flags = await getUnreviewedFraudFlags();
    return NextResponse.json({ success: true, data: flags });
  })
);
