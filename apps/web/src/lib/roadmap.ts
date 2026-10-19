import type { PrismaClient } from "@prisma/client";

/**
 * Public roadmap (2026-10-18). Shared read model for the web page, the
 * public API and the mobile screen so all three show the same thing.
 */

export const ROADMAP_STATUSES = ["building", "considering", "shipped"] as const;
export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];

export function isRoadmapStatus(s: unknown): s is RoadmapStatus {
  return typeof s === "string" && (ROADMAP_STATUSES as readonly string[]).includes(s);
}

export type RoadmapItemDTO = {
  id: string;
  title: string;
  summary: string;
  status: RoadmapStatus;
  votes: number;
  votedByMe: boolean;
  shippedVersion: string | null;
  shippedAt: string | null;
};

export const TITLE_MAX = 80;
export const SUMMARY_MAX = 400;

/** Ordering within a column: building/considering by votes then sortOrder; shipped newest first. */
function sortItems(a: RoadmapItemDTO, b: RoadmapItemDTO): number {
  if (a.status !== b.status) {
    return ROADMAP_STATUSES.indexOf(a.status) - ROADMAP_STATUSES.indexOf(b.status);
  }
  if (a.status === "shipped") {
    return (b.shippedAt ?? "").localeCompare(a.shippedAt ?? "");
  }
  return b.votes - a.votes;
}

export async function listRoadmap(
  prisma: PrismaClient,
  viewerUserId: string | null
): Promise<RoadmapItemDTO[]> {
  const rows = await prisma.roadmapItem.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      _count: { select: { votes: true } },
      votes: viewerUserId
        ? { where: { userId: viewerUserId }, select: { userId: true } }
        : false,
    },
  });
  const items: RoadmapItemDTO[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    status: isRoadmapStatus(r.status) ? r.status : "considering",
    votes: r._count.votes,
    votedByMe: Array.isArray(r.votes) ? r.votes.length > 0 : false,
    shippedVersion: r.shippedVersion,
    shippedAt: r.shippedAt ? r.shippedAt.toISOString() : null,
  }));
  // Stable: Prisma's sortOrder/createdAt order is the tie-break inside sortItems.
  return items.sort(sortItems);
}

/** Toggle a vote. Returns the new state + count. Shipped items can't be voted. */
export async function toggleVote(
  prisma: PrismaClient,
  itemId: string,
  userId: string
): Promise<{ voted: boolean; votes: number } | { error: "not_found" | "shipped" }> {
  const item = await prisma.roadmapItem.findUnique({
    where: { id: itemId },
    select: { id: true, status: true },
  });
  if (!item) return { error: "not_found" };
  if (item.status === "shipped") return { error: "shipped" };

  const existing = await prisma.roadmapVote.findUnique({
    where: { itemId_userId: { itemId, userId } },
    select: { userId: true },
  });
  if (existing) {
    await prisma.roadmapVote.delete({ where: { itemId_userId: { itemId, userId } } });
  } else {
    await prisma.roadmapVote.create({ data: { itemId, userId } });
  }
  const votes = await prisma.roadmapVote.count({ where: { itemId } });
  return { voted: !existing, votes };
}

// ─── Admin write validation ─────────────────────────────────────────

export type RoadmapWriteBody = {
  title?: unknown;
  summary?: unknown;
  status?: unknown;
  sortOrder?: unknown;
  shippedVersion?: unknown;
};

export type RoadmapWriteData = {
  title?: string;
  summary?: string;
  status?: RoadmapStatus;
  sortOrder?: number;
  shippedVersion?: string | null;
  shippedAt?: Date | null;
};

/**
 * Validate + normalise an admin create (partial=false: title+summary
 * required) or update (partial=true) body. Moving to `shipped` stamps
 * shippedAt; moving away clears it.
 */
export function parseRoadmapBody(
  body: RoadmapWriteBody,
  { partial }: { partial: boolean }
): { ok: true; data: RoadmapWriteData } | { ok: false; error: string } {
  const data: RoadmapWriteData = {};
  if (body.title !== undefined || !partial) {
    const t = typeof body.title === "string" ? body.title.trim() : "";
    if (t.length < 3 || t.length > TITLE_MAX) {
      return { ok: false, error: `title must be 3–${TITLE_MAX} characters` };
    }
    data.title = t;
  }
  if (body.summary !== undefined || !partial) {
    const s = typeof body.summary === "string" ? body.summary.trim() : "";
    if (s.length < 3 || s.length > SUMMARY_MAX) {
      return { ok: false, error: `summary must be 3–${SUMMARY_MAX} characters` };
    }
    data.summary = s;
  }
  if (body.status !== undefined) {
    if (!isRoadmapStatus(body.status)) {
      return { ok: false, error: "status must be building | considering | shipped" };
    }
    data.status = body.status;
    data.shippedAt = body.status === "shipped" ? new Date() : null;
  }
  if (body.sortOrder !== undefined) {
    const n = Number(body.sortOrder);
    if (!Number.isInteger(n)) return { ok: false, error: "sortOrder must be an integer" };
    data.sortOrder = n;
  }
  if (body.shippedVersion !== undefined) {
    if (body.shippedVersion === null || body.shippedVersion === "") {
      data.shippedVersion = null;
    } else if (
      typeof body.shippedVersion === "string" &&
      /^\d+\.\d+(\.\d+)?$/.test(body.shippedVersion.trim())
    ) {
      data.shippedVersion = body.shippedVersion.trim();
    } else {
      return { ok: false, error: "shippedVersion must look like 1.9.4" };
    }
  }
  return { ok: true, data };
}
