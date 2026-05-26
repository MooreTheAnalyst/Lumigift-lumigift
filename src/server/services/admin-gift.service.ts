import type { Gift, GiftStatus } from "@/types";
import { gifts } from "./gift.service";

// ─── Audit log (in-memory; replace with DB table in production) ──────────────

export interface AuditEntry {
  id: string;
  adminId: string;
  action: string;
  targetId: string;
  createdAt: Date;
}

const auditLog: AuditEntry[] = [];

export function logAdminAction(
  adminId: string,
  action: string,
  targetId: string
): void {
  auditLog.push({
    id: crypto.randomUUID(),
    adminId,
    action,
    targetId,
    createdAt: new Date(),
  });
}

export function getAuditLog(): AuditEntry[] {
  return [...auditLog];
}

// ─── Admin gift queries ───────────────────────────────────────────────────────

export interface AdminGiftQuery {
  search?: string;   // matches recipientName (case-insensitive)
  status?: GiftStatus;
  cursor?: string;
  limit?: number;
}

export interface AdminGiftPage {
  gifts: Gift[];
  total: number;
  nextCursor: string | null;
}

export function adminListGifts(query: AdminGiftQuery): AdminGiftPage {
  const limit = Math.min(query.limit ?? 20, 100);

  let all = [...gifts.values()].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

  if (query.status) {
    all = all.filter((g) => g.status === query.status);
  }

  if (query.search) {
    const term = query.search.toLowerCase();
    all = all.filter((g) => g.recipientName.toLowerCase().includes(term));
  }

  const startIndex = query.cursor
    ? all.findIndex((g) => g.id === query.cursor) + 1
    : 0;

  const page = all.slice(startIndex, startIndex + limit);
  const nextCursor =
    startIndex + limit < all.length ? page[page.length - 1]?.id ?? null : null;

  return { gifts: page, total: all.length, nextCursor };
}

export function adminGetGift(id: string): Gift | null {
  return gifts.get(id) ?? null;
}
