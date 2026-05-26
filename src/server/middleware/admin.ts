import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { ApiError } from "@/types";

/** Returns the session user ID if the caller is an admin, or a 403 response. */
export async function requireAdmin(): Promise<
  { userId: string } | NextResponse<ApiError>
> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json<ApiError>(
      { success: false, error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const userId = (session.user as { id: string }).id;
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").filter(Boolean);

  if (!adminIds.includes(userId)) {
    return NextResponse.json<ApiError>(
      { success: false, error: "Forbidden", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  return { userId };
}
