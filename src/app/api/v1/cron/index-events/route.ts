import { NextRequest, NextResponse } from "next/server";
import { indexEscrowEvents } from "@/server/services/event-indexer.service";
import type { ApiResponse } from "@/types";

/**
 * Cron endpoint — indexes Soroban escrow contract events and syncs gift status.
 *
 * Called by Vercel Cron (or an external scheduler) on a regular cadence.
 * Protected by the same CRON_SECRET bearer token used by other cron routes.
 *
 * Vercel cron config (vercel.json):
 *   { "path": "/api/v1/cron/index-events", "schedule": "* * * * *" }
 */
export const GET = async (req: NextRequest) => {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const startedAt = Date.now();

  try {
    const result = await indexEscrowEvents();
    const durationMs = Date.now() - startedAt;

    console.log("[cron/index-events]", { ...result, durationMs });

    return NextResponse.json<
      ApiResponse<{ processed: number; skipped: number; latestCursor: string; durationMs: number }>
    >({
      success: true,
      data: { ...result, durationMs },
    });
  } catch (err) {
    console.error("[cron/index-events] failed", err);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Event indexing failed" },
      { status: 500 }
    );
  }
};
