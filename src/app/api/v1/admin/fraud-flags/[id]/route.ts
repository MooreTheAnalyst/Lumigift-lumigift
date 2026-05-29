import { NextRequest, NextResponse } from "next/server";
import { withAdmin, withErrorHandler } from "@/server/middleware";
import { markFraudFlagReviewed } from "@/server/services/fraud.service";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";

const reviewSchema = z.object({
  action: z.enum(["approved", "rejected"]),
  notes: z.string().optional(),
});

export const PATCH = withErrorHandler(
  withAdmin(async (req: NextRequest, context: unknown) => {
    const { id } = (context as { params: { id: string } }).params;
    const body = await req.json();
    const parsed = reviewSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    const session = await getServerSession(authOptions);
    const reviewedBy = (session?.user as { id?: string })?.id ?? "unknown";

    await markFraudFlagReviewed(id, reviewedBy, parsed.data.action, parsed.data.notes);

    return NextResponse.json({ success: true });
  })
);
