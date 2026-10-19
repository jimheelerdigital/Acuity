import type { PrismaClient } from "@prisma/client";
import {
  ROADMAP_STATUSES,
  isRoadmapCategory,
  isRoadmapStatus,
  type RoadmapCategory,
  type RoadmapStatus,
} from "@acuity/shared";

/**
 * Public roadmap (2026-10-18; detail pages 2026-10-19). Shared read model
 * for the web page, the public API and the mobile screens so all three show
 * the same thing. Status/category vocabulary lives in @acuity/shared.
 */

export { ROADMAP_STATUSES, isRoadmapStatus };
export type { RoadmapStatus, RoadmapCategory };

/** What a list/card needs. */
export type RoadmapItemDTO = {
  id: string;
  title: string;
  summary: string;
  status: RoadmapStatus;
  category: RoadmapCategory | null;
  timeframe: string | null;
  votes: number;
  votedByMe: boolean;
  shippedVersion: string | null;
  shippedAt: string | null;
  /** True when the item has detail content beyond title + summary. */
  hasDetails: boolean;
};

/** What the detail page needs: the card plus the body sections. */
export type RoadmapItemDetailDTO = RoadmapItemDTO & {
  problem: string | null;
  solution: string | null;
  highlights: string[];
  howTo: string | null;
};

export const TITLE_MAX = 80;
export const SUMMARY_MAX = 400;
export const TIMEFRAME_MAX = 40;
export const SECTION_MAX = 2000;
export const HIGHLIGHT_MAX = 160;
export const HIGHLIGHTS_MAX_COUNT = 8;

type Row = {
  id: string;
  title: string;
  summary: string;
  status: string;
  shippedVersion: string | null;
  shippedAt: Date | null;
  category?: string | null;
  timeframe?: string | null;
  problem?: string | null;
  solution?: string | null;
  highlights?: string[] | null;
  howTo?: string | null;
  _count: { votes: number };
  votes?: Array<{ userId: string }> | false;
};

function toDetail(r: Row): RoadmapItemDetailDTO {
  const highlights = Array.isArray(r.highlights) ? r.highlights.filter((h) => h.trim().length > 0) : [];
  const problem = r.problem?.trim() || null;
  const solution = r.solution?.trim() || null;
  const howTo = r.howTo?.trim() || null;
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    status: isRoadmapStatus(r.status) ? r.status : "considering",
    category: isRoadmapCategory(r.category) ? r.category : null,
    timeframe: r.timeframe?.trim() || null,
    votes: r._count.votes,
    votedByMe: Array.isArray(r.votes) ? r.votes.length > 0 : false,
    shippedVersion: r.shippedVersion,
    shippedAt: r.shippedAt ? r.shippedAt.toISOString() : null,
    hasDetails: !!(problem || solution || howTo || highlights.length > 0),
    problem,
    solution,
    highlights,
    howTo,
  };
}

function toCard(r: Row): RoadmapItemDTO {
  const { problem: _p, solution: _s, highlights: _h, howTo: _t, ...card } = toDetail(r);
  return card;
}

/** Ordering: by status column; open items by votes; shipped newest first. */
export function sortItems(a: RoadmapItemDTO, b: RoadmapItemDTO): number {
  if (a.status !== b.status) {
    return ROADMAP_STATUSES.indexOf(a.status) - ROADMAP_STATUSES.indexOf(b.status);
  }
  if (a.status === "shipped") {
    return (b.shippedAt ?? "").localeCompare(a.shippedAt ?? "");
  }
  return b.votes - a.votes;
}

function voteInclude(viewerUserId: string | null) {
  return {
    _count: { select: { votes: true } },
    votes: viewerUserId
      ? { where: { userId: viewerUserId }, select: { userId: true } }
      : (false as const),
  };
}

export async function listRoadmap(
  prisma: PrismaClient,
  viewerUserId: string | null
): Promise<RoadmapItemDTO[]> {
  const rows = (await prisma.roadmapItem.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: voteInclude(viewerUserId),
  })) as unknown as Row[];
  // Stable: Prisma's sortOrder/createdAt order is the tie-break inside sortItems.
  return rows.map(toCard).sort(sortItems);
}

export async function getRoadmapItem(
  prisma: PrismaClient,
  id: string,
  viewerUserId: string | null
): Promise<RoadmapItemDetailDTO | null> {
  const row = (await prisma.roadmapItem.findUnique({
    where: { id },
    include: voteInclude(viewerUserId),
  })) as unknown as Row | null;
  return row ? toDetail(row) : null;
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
  category?: unknown;
  timeframe?: unknown;
  problem?: unknown;
  solution?: unknown;
  highlights?: unknown;
  howTo?: unknown;
};

export type RoadmapWriteData = {
  title?: string;
  summary?: string;
  status?: RoadmapStatus;
  sortOrder?: number;
  shippedVersion?: string | null;
  shippedAt?: Date | null;
  category?: RoadmapCategory | null;
  timeframe?: string | null;
  problem?: string | null;
  solution?: string | null;
  highlights?: string[];
  howTo?: string | null;
};

/** Optional free-text field: "" / null clears it; otherwise trimmed + length-capped. */
function optionalText(
  v: unknown,
  name: string,
  max: number
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (v === null || v === "") return { ok: true, value: null };
  if (typeof v !== "string") return { ok: false, error: `${name} must be text` };
  const t = v.trim();
  if (t.length === 0) return { ok: true, value: null };
  if (t.length > max) return { ok: false, error: `${name} must be ≤${max} characters` };
  return { ok: true, value: t };
}

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
      return { ok: false, error: `status must be ${ROADMAP_STATUSES.join(" | ")}` };
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
  if (body.category !== undefined) {
    if (body.category === null || body.category === "") data.category = null;
    else if (isRoadmapCategory(body.category)) data.category = body.category;
    else return { ok: false, error: "unknown category" };
  }
  const texts: Array<["timeframe" | "problem" | "solution" | "howTo", number]> = [
    ["timeframe", TIMEFRAME_MAX],
    ["problem", SECTION_MAX],
    ["solution", SECTION_MAX],
    ["howTo", SECTION_MAX],
  ];
  for (const [key, max] of texts) {
    if (body[key] === undefined) continue;
    const r = optionalText(body[key], key, max);
    if (!r.ok) return r;
    data[key] = r.value;
  }
  if (body.highlights !== undefined) {
    // Accept an array or one-per-line text (the admin textarea).
    const raw =
      typeof body.highlights === "string"
        ? body.highlights.split("\n")
        : Array.isArray(body.highlights)
          ? body.highlights
          : null;
    if (!raw || raw.some((h) => typeof h !== "string")) {
      return { ok: false, error: "highlights must be a list of text lines" };
    }
    const lines = (raw as string[]).map((h) => h.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
    if (lines.length > HIGHLIGHTS_MAX_COUNT) {
      return { ok: false, error: `at most ${HIGHLIGHTS_MAX_COUNT} highlights` };
    }
    if (lines.some((l) => l.length > HIGHLIGHT_MAX)) {
      return { ok: false, error: `each highlight must be ≤${HIGHLIGHT_MAX} characters` };
    }
    data.highlights = lines;
  }
  return { ok: true, data };
}
