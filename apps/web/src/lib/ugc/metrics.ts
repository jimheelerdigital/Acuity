/**
 * UGC outreach numbers for the admin page and the weekly digest.
 *
 * "Trial" = a started 7-day trial; a direct monthly purchase also counts as
 * one; a free signup doesn't. Trials, ad spend and paid conversions per
 * video are typed in by Keenan for now. Alongside them the page shows
 * "tracked" signups/trials from each creator's tracking link
 * (utm_campaign=ugc-<code>), as a cross-check.
 */
import type { UgcCreator, UgcVideo } from "@prisma/client";

import {
  KILL_SPEND,
  LOW_DEAL_COUNT,
  LOW_DEAL_OFFERS,
  RAISED_FEE_SUGGESTION,
  RIGHTS_WARNING_DAYS,
} from "@/lib/ugc/config";
import { reached } from "@/lib/ugc/status";

export const trackingCampaign = (code: string) => `ugc-${code}`;

/** Ad cost per trial for one video (null until it has trials). */
export function costPerTrial(v: Pick<UgcVideo, "adSpendCents" | "trials">): number | null {
  if (v.adSpendCents == null || !v.trials) return null;
  return v.adSpendCents / 100 / v.trials;
}

export function isKill(v: Pick<UgcVideo, "adSpendCents" | "trials">): boolean {
  return (v.adSpendCents ?? 0) >= KILL_SPEND * 100 && (v.trials ?? 0) === 0;
}

export function rightsEndingSoon(v: Pick<UgcVideo, "rightsEndAt">, now = Date.now()): boolean {
  if (!v.rightsEndAt) return false;
  const left = v.rightsEndAt.getTime() - now;
  return left >= 0 && left <= RIGHTS_WARNING_DAYS * 86_400_000;
}

export function totalPaidCents(c: Pick<UgcCreator, "feePaidCents">, videos: Pick<UgcVideo, "bonusPaidCents" | "extensionPaidCents">[]): number {
  return c.feePaidCents + videos.reduce((s, v) => s + v.bonusPaidCents + v.extensionPaidCents, 0);
}

export interface GroupStats {
  offersSent: number;
  replied: number;
  replyRate: number | null;
  deals: number;
  paidCents: number;
  avgCostPerTrial: number | null;
}

type CreatorWithVideos = UgcCreator & { videos: UgcVideo[] };

function offerSent(c: CreatorWithVideos): boolean {
  return reached(c.status, "contacted") || (c.status === "do_not_contact" && !!c.contactedAt);
}

export function groupStats(creators: CreatorWithVideos[]): GroupStats {
  const sent = creators.filter(offerSent);
  const replied = sent.filter((c) => reached(c.status, "replied") || !!c.repliedAt).length;
  const deals = creators.filter((c) => reached(c.status, "deal")).length;
  const paidCents = creators.reduce((s, c) => s + totalPaidCents(c, c.videos), 0);
  const vids = creators.flatMap((c) => c.videos);
  const spend = vids.reduce((s, v) => s + (v.adSpendCents ?? 0), 0);
  const trials = vids.reduce((s, v) => s + (v.trials ?? 0), 0);
  return {
    offersSent: sent.length,
    replied,
    replyRate: sent.length ? replied / sent.length : null,
    deals,
    paidCents,
    avgCostPerTrial: trials ? spend / 100 / trials : null,
  };
}

export function lowDealWarning(all: GroupStats): string | null {
  return all.offersSent >= LOW_DEAL_OFFERS && all.deals < LOW_DEAL_COUNT
    ? `Consider raising MAX_FEE_PER_VIDEO to ${RAISED_FEE_SUGGESTION}.`
    : null;
}

export async function loadDashboard(filters: { status?: string; persona?: string; creatorType?: string } = {}) {
  const { prisma } = await import("@/lib/prisma");
  const all = (await prisma.ugcCreator.findMany({
    include: { videos: { orderBy: [{ videoNumber: "asc" }, { hookVersion: "asc" }] } },
    orderBy: [{ score: "desc" }],
  })) as CreatorWithVideos[];

  const byPersona: Record<string, GroupStats> = {};
  for (const p of ["midlife", "ambitious"]) byPersona[p] = groupStats(all.filter((c) => c.persona === p));
  const byType: Record<string, GroupStats> = {};
  for (const t of ["credentialed", "lookalike", "productivity"]) byType[t] = groupStats(all.filter((c) => c.creatorType === t));
  const overall = groupStats(all);

  const videos = all.flatMap((c) => c.videos.map((v) => ({ ...v, creator: c })));
  const kill = videos.filter((v) => isKill(v));
  const rehire = all.filter((c) => c.videos.some((v) => v.winner));
  const rights = videos.filter((v) => rightsEndingSoon(v));

  // Tracked signups / trials per creator link.
  const codes = all.filter((c) => reached(c.status, "deal")).map((c) => trackingCampaign(c.trackingCode));
  const users = codes.length
    ? await prisma.user.findMany({
        where: { signupUtmCampaign: { in: codes } },
        select: { signupUtmCampaign: true, subscriptionSource: true, subscriptionStatus: true },
      })
    : [];
  const tracked: Record<string, { signups: number; trials: number }> = {};
  for (const u of users) {
    const k = u.signupUtmCampaign!;
    tracked[k] ??= { signups: 0, trials: 0 };
    tracked[k].signups++;
    // A card/store trial or purchase has a subscription source; a free signup doesn't.
    if (u.subscriptionSource) tracked[k].trials++;
  }

  const shown = all.filter(
    (c) =>
      (!filters.status || c.status === filters.status) &&
      (!filters.persona || c.persona === filters.persona) &&
      (!filters.creatorType || c.creatorType === filters.creatorType)
  );

  return { all, shown, overall, byPersona, byType, kill, rehire, rights, warning: lowDealWarning(overall), tracked };
}
