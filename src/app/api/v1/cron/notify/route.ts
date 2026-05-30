import { NextRequest, NextResponse } from "next/server";
import { processScheduledNotifications } from "@/server/services/scheduler.service";
import type { ApiResponse } from "@/types";

/** Called by Vercel Cron every minute to dispatch scheduled gift notifications. */
export const GET = async (req: NextRequest) => {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const startedAt = new Date();
  try {
    const dispatched = await processScheduledNotifications();
    const durationMs = Date.now() - startedAt.getTime();
    console.log("[cron] notify run complete", { dispatched, durationMs });
    return NextResponse.json<ApiResponse<{ dispatched: number; durationMs: number }>>({
      success: true,
      data: { dispatched, durationMs },
    });
  } catch (err) {
    console.error("[cron] notify run failed", err);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Cron job failed" },
      { status: 500 }
    );
  }
};
