/**
 * Manual add (UGC outreach): Keenan pastes a handle, plus optional notes
 * and a quoted rate — creators spotted in competitor ads, or creators who
 * pitched us. The row is created as "found" with source "manual" and the
 * next pipeline run (fired right away by the add route) takes it through
 * the same enrich → score → draft steps. Manual adds skip the
 * no-email/no-portfolio drop and the weekly cap (Keenan picked them).
 */
import { MAX_FEE_PER_VIDEO, type Platform } from "@/lib/ugc/config";
import {
  normalizeHandle,
  profileUrlFor,
  type Candidate,
  type SourceAdapter,
} from "@/lib/ugc/sources/types";

export interface ManualAddInput {
  /** "@name", "name", or a full instagram.com / tiktok.com profile URL. */
  handle: string;
  platform?: Platform;
  notes?: string;
  /** Dollars, as quoted. */
  quotedRate?: number;
  /** How many videos the quote covers (default 1). */
  quotedVideos?: number;
}

export function parseManualHandle(input: ManualAddInput): { platform: Platform; handle: string } {
  const raw = input.handle.trim();
  const platform: Platform =
    input.platform ?? (/tiktok\.com/i.test(raw) ? "tiktok" : "instagram");
  const handle = normalizeHandle(raw.replace(/\?.*$/, "").replace(/^https?:\/\/[^/]+\/?/i, ""));
  if (!handle || !/^[a-z0-9._]{1,40}$/.test(handle)) {
    throw new Error(`Not a valid handle: "${input.handle}"`);
  }
  return { platform, handle };
}

/** Quoted rate → cost per video in cents, and whether it's under the cap. */
export function quoteMath(quotedRate?: number | null, quotedVideos?: number | null) {
  if (quotedRate == null || !(quotedRate > 0)) return { quotedRateCents: null, costPerVideoCents: null, underFeeCap: null };
  const videos = quotedVideos && quotedVideos > 0 ? quotedVideos : 1;
  const quotedRateCents = Math.round(quotedRate * 100);
  const costPerVideoCents = Math.round(quotedRateCents / videos);
  return {
    quotedRateCents,
    costPerVideoCents,
    underFeeCap: costPerVideoCents <= MAX_FEE_PER_VIDEO * 100,
  };
}

/** Manual creators still waiting for their first pipeline run. */
export const manualSource: SourceAdapter = {
  name: "manual",
  async discover({ max }) {
    const { prisma } = await import("@/lib/prisma");
    const rows = await prisma.ugcCreator.findMany({
      where: { source: "manual", status: "found" },
      orderBy: { createdAt: "asc" },
      take: max,
    });
    return rows.map(
      (r): Candidate => ({
        platform: r.platform as Platform,
        handle: r.handle,
        source: "manual",
        creatorId: r.id,
        profileUrl: r.profileUrl ?? profileUrlFor(r.platform as Platform, r.handle),
        notes: r.notes,
        quotedRateCents: r.quotedRateCents,
        costPerVideoCents: r.costPerVideoCents,
      })
    );
  },
};
