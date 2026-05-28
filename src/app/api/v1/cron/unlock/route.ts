import { NextRequest, NextResponse } from "next/server";
import { processUnlocks } from "@/server/services/scheduler.service";
import type { ApiResponse } from "@/types";

/** Ping a dead-man's-switch URL (e.g. Healthchecks.io / BetterUptime). */
async function pingHealthcheck(suffix = "") {
  const url = process.env.HEALTHCHECK_URL;
  if (!url) return;
  try {
    await fetch(`${url}${suffix}`, { method: "GET" });
  } catch (err) {
    console.error("[cron] healthcheck ping failed", err);
  }
}

/** Called by Vercel Cron or an external scheduler every minute. */
export const GET = async (req: NextRequest) => {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const startedAt = new Date();
  console.log("[cron] unlock run started", { startedAt });

  try {
    const processed = await processUnlocks();
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    console.log("[cron] unlock run complete", { finishedAt, durationMs, processed });

    await pingHealthcheck(); // success ping

    return NextResponse.json<ApiResponse<{ processed: number; durationMs: number }>>({
      success: true,
      data: { processed, durationMs },
    });
  } catch (err) {
    console.error("[cron] unlock run failed", { startedAt, error: err });
    await pingHealthcheck("/fail"); // failure ping
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Cron job failed" },
      { status: 500 }
    );
  }
};
